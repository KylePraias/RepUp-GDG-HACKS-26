import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  StickyNote,
  ListChecks,
  Bookmark,
  Plus,
  Trash2,
  Pencil,
  Check,
  X as XIcon,
  ExternalLink,
  Loader2,
  RefreshCw,
  GitBranch,
  GitPullRequest,
  FileCode2,
  CircleDot,
  Folder,
  GripVertical,
} from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  parseGithubUrl,
  hasChromeTabs,
  getActiveTab,
  openUrl,
  newId,
} from "../lib/notes";

const SECTION_TABS = [
  { id: "todos", label: "Todos", icon: ListChecks },
  { id: "bookmarks", label: "Bookmarks", icon: Bookmark },
];

export default function Notes() {
  const { user } = useAuth();
  const [section, setSection] = useState("todos");

  if (!user) return null;

  return (
    <div className="flex flex-col gap-4" data-testid="notes-screen">
      {/* Header */}
      <div className="bento p-4">
        <div className="flex items-center gap-2 text-[#CCFF00]">
          <StickyNote className="h-5 w-5" strokeWidth={2.6} />
          <span className="font-mono text-[10px] uppercase tracking-widest">
            Notes
          </span>
        </div>
        <div className="mt-1 font-display text-xl font-black">Stash &amp; ship</div>
        <div className="text-xs text-white/60">
          Quick to-dos and a bookmark stash for repos, PRs, and files you want
          to come back to.
        </div>
      </div>

      {/* Section tabs */}
      <div
        className="flex items-stretch gap-1 rounded-2xl border-2 border-white/10 bg-[#0f0f10] p-1"
        data-testid="notes-section-tabs"
      >
        {SECTION_TABS.map((t) => (
          <SectionTab
            key={t.id}
            active={section === t.id}
            onClick={() => setSection(t.id)}
            icon={t.icon}
            label={t.label}
            testid={`notes-tab-${t.id}`}
          />
        ))}
      </div>

      {section === "todos" ? <TodosPanel uid={user.uid} /> : <BookmarksPanel uid={user.uid} />}
    </div>
  );
}

function SectionTab({ active, onClick, icon: Icon, label, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
        active
          ? "bg-[#CCFF00] text-black shadow-[0_2px_0_rgba(0,0,0,0.4)]"
          : "text-white/60 hover:text-white"
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={2.6} />
      {label}
    </button>
  );
}

// =====================================================================
// TODOs
// =====================================================================

// Numeric sort key. Lower = higher in the list. Falls back to negative
// createdAt for legacy todos that pre-date the `order` field.
function orderKey(t) {
  if (typeof t.order === "number" && Number.isFinite(t.order)) return t.order;
  const ms = t.createdAt?.toMillis?.() ?? 0;
  return -ms;
}

// Compute the `order` value that should be written for an item dropped at
// `newIndex` in `sortedItems`. Uses a fractional-index strategy: the new value
// is the midpoint between the two neighbors, so a single-doc write is enough
// (no whole-list rebalance). When dropping at an edge we just step ±1.
function computeNewOrder(sortedItems, newIndex) {
  const prev = newIndex > 0 ? sortedItems[newIndex - 1] : null;
  const next = newIndex < sortedItems.length - 1 ? sortedItems[newIndex + 1] : null;
  if (!prev && !next) return 0;
  if (!prev) return orderKey(next) - 1;
  if (!next) return orderKey(prev) + 1;
  return (orderKey(prev) + orderKey(next)) / 2;
}

function TodosPanel({ uid }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);

  // dnd-kit sensors. PointerSensor with a distance threshold so a tap on
  // the drag handle that doesn't actually drag won't initiate a reorder.
  // TouchSensor with a delay so checkbox / button taps still register on
  // mobile. KeyboardSensor for accessibility.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Live subscription. We sort client-side by `order` to stay tolerant of
  // legacy docs without that field.
  useEffect(() => {
    if (!uid) return undefined;
    const colRef = collection(db, "users", uid, "todos");
    // Order by createdAt for predictable initial paint; final visual order
    // comes from the client-side sort below using `order` (with createdAt
    // fallback). This avoids excluding legacy docs missing `order`.
    const q = query(colRef, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data());
        list.sort((a, b) => orderKey(a) - orderKey(b));
        setTodos(list);
        setLoading(false);
      },
      (e) => {
        console.warn("todos snapshot failed", e);
        setError(e?.message || "Failed to load todos");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [uid]);

  const addTodo = useCallback(async () => {
    const text = newText.trim();
    if (!text || !uid) return;
    setAdding(true);
    setError(null);
    try {
      const id = newId();
      // New todos go to the TOP (smallest order). Pulled from current local
      // list — onSnapshot will replace this with the canonical value once
      // the write commits.
      const minOrder = todos.length ? orderKey(todos[0]) : 0;
      await setDoc(doc(db, "users", uid, "todos", id), {
        id,
        text,
        done: false,
        order: minOrder - 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewText("");
    } catch (e) {
      setError(e?.message || "Could not add todo");
    } finally {
      setAdding(false);
    }
  }, [newText, uid, todos]);

  const toggleDone = useCallback(
    async (todo) => {
      if (!uid) return;
      try {
        await updateDoc(doc(db, "users", uid, "todos", todo.id), {
          done: !todo.done,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        setError(e?.message || "Could not update todo");
      }
    },
    [uid],
  );

  const editTodo = useCallback(
    async (id, nextText) => {
      const text = nextText.trim();
      if (!text || !uid) return;
      try {
        await updateDoc(doc(db, "users", uid, "todos", id), {
          text,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        setError(e?.message || "Could not save edit");
      }
    },
    [uid],
  );

  const removeTodo = useCallback(
    async (id) => {
      if (!uid) return;
      try {
        await deleteDoc(doc(db, "users", uid, "todos", id));
      } catch (e) {
        setError(e?.message || "Could not delete todo");
      }
    },
    [uid],
  );

  const handleDragEnd = useCallback(
    async (event) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = todos.findIndex((t) => t.id === active.id);
      const newIndex = todos.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      // Optimistic local reorder so the row settles in its new spot
      // immediately, even before Firestore round-trips.
      const optimistic = arrayMove(todos, oldIndex, newIndex);
      setTodos(optimistic);

      const newOrder = computeNewOrder(optimistic, newIndex);
      try {
        await updateDoc(doc(db, "users", uid, "todos", active.id), {
          order: newOrder,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        // Revert on failure (snapshot will also overwrite shortly).
        setError(e?.message || "Could not reorder");
        setTodos(todos);
      }
    },
    [todos, uid],
  );

  const counts = useMemo(() => {
    const total = todos.length;
    const done = todos.filter((t) => t.done).length;
    return { total, done, open: total - done };
  }, [todos]);

  const todoIds = useMemo(() => todos.map((t) => t.id), [todos]);

  return (
    <div className="flex flex-col gap-3" data-testid="todos-panel">
      {/* Add row */}
      <div className="flex items-stretch gap-2">
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTodo();
            }
          }}
          placeholder="Add a to-do..."
          maxLength={300}
          data-testid="todo-input"
          className="min-w-0 flex-1 rounded-2xl border-2 border-white/10 bg-[#141414] px-3 py-2 text-sm placeholder:text-white/30 focus:border-[#CCFF00]/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={addTodo}
          disabled={!newText.trim() || adding}
          data-testid="todo-add-btn"
          className="btn-push btn-level flex items-center gap-1 px-3 py-2 text-xs"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={3} />}
          Add
        </button>
      </div>

      {/* Counters */}
      {counts.total > 0 && (
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-white/50">
          <span>{counts.open} open</span>
          <span className="text-white/20">·</span>
          <span>{counts.done} done</span>
          {counts.total > 1 && (
            <>
              <span className="text-white/20">·</span>
              <span className="text-white/40">drag to reorder</span>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[#FF3B30]/40 bg-[#FF3B30]/10 px-3 py-2 text-xs text-[#FF8A82]">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-white/60" />
        </div>
      )}

      {!loading && todos.length === 0 && !error && (
        <div
          className="rounded-2xl border-2 border-dashed border-white/10 p-6 text-center text-sm text-white/60"
          data-testid="todos-empty"
        >
          No to-dos yet. Type one above and hit Enter.
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={todoIds} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2" data-testid="todos-list">
            {todos.map((t) => (
              <SortableTodoItem
                key={t.id}
                todo={t}
                onToggle={() => toggleDone(t)}
                onEdit={(text) => editTodo(t.id, text)}
                onRemove={() => removeTodo(t.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

// Wraps TodoItem with dnd-kit's useSortable. The drag handle (GripVertical)
// is the ONLY element that initiates a drag — checkboxes, edit, and delete
// buttons remain tappable.
function SortableTodoItem({ todo, onToggle, onEdit, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  return (
    <TodoItem
      todo={todo}
      onToggle={onToggle}
      onEdit={onEdit}
      onRemove={onRemove}
      dragHandleProps={{ ...attributes, ...listeners }}
      setNodeRef={setNodeRef}
      style={style}
      isDragging={isDragging}
    />
  );
}

function TodoItem({
  todo,
  onToggle,
  onEdit,
  onRemove,
  dragHandleProps,
  setNodeRef,
  style,
  isDragging,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.text);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) {
      setDraft(todo.text);
      // focus after render
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing, todo.text]);

  const commit = () => {
    const next = draft.trim();
    if (!next) {
      setEditing(false);
      setDraft(todo.text);
      return;
    }
    if (next !== todo.text) onEdit(next);
    setEditing(false);
  };
  const cancel = () => {
    setEditing(false);
    setDraft(todo.text);
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-testid={`todo-row-${todo.id}`}
      data-done={todo.done ? "true" : "false"}
      data-dragging={isDragging ? "true" : "false"}
      className={`flex items-start gap-2 rounded-2xl border-2 bg-[#141414] p-3 ${
        isDragging
          ? "border-[#CCFF00]/60 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
          : "border-white/10"
      }`}
    >
      {/* Drag handle — only this element initiates a drag (PointerSensor with
          5px distance threshold means a stray click won't grab the row). */}
      {dragHandleProps && (
        <button
          type="button"
          {...dragHandleProps}
          aria-label="Drag to reorder"
          data-testid={`todo-drag-${todo.id}`}
          className="-ml-1 mt-0.5 flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-white/30 hover:text-white/70 active:cursor-grabbing"
          // Don't let the click bubble through and toggle anything by accident.
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" strokeWidth={2} />
        </button>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-label={todo.done ? "Mark not done" : "Mark done"}
        data-testid={`todo-toggle-${todo.id}`}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
          todo.done
            ? "border-[#CCFF00] bg-[#CCFF00] text-black"
            : "border-white/30 hover:border-white/60"
        }`}
      >
        {todo.done && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
      </button>

      {editing ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            maxLength={300}
            data-testid={`todo-edit-input-${todo.id}`}
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-sm text-white focus:border-[#CCFF00]/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={commit}
            data-testid={`todo-edit-save-${todo.id}`}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-[#CCFF00] text-black"
            title="Save"
          >
            <Check className="h-4 w-4" strokeWidth={3} />
          </button>
          <button
            type="button"
            onClick={cancel}
            data-testid={`todo-edit-cancel-${todo.id}`}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/15 text-white/70"
            title="Cancel"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span
            className={`min-w-0 flex-1 break-words text-sm ${
              todo.done ? "text-white/40 line-through" : "text-white"
            }`}
            data-testid={`todo-text-${todo.id}`}
          >
            {todo.text}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            data-testid={`todo-edit-btn-${todo.id}`}
            className="shrink-0 rounded-md p-1 text-white/40 hover:text-white"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            data-testid={`todo-delete-btn-${todo.id}`}
            className="shrink-0 rounded-md p-1 text-white/40 hover:text-[#FF8A82]"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </li>
  );
}

// =====================================================================
// BOOKMARKS
// =====================================================================

function BookmarksPanel({ uid }) {
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Active-tab detection (extension only). Web-preview path = paste URL.
  const inExtension = hasChromeTabs();
  const [currentRepo, setCurrentRepo] = useState(null); // parsed repo of active tab
  const [currentDetectStatus, setCurrentDetectStatus] = useState(
    inExtension ? "loading" : "fallback",
  );
  const [pasteUrl, setPasteUrl] = useState("");
  const [adding, setAdding] = useState(false);

  // Subscribe to bookmarks.
  useEffect(() => {
    if (!uid) return undefined;
    const colRef = collection(db, "users", uid, "bookmarks");
    const q = query(colRef, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setBookmarks(snap.docs.map((d) => d.data()));
        setLoading(false);
      },
      (e) => {
        console.warn("bookmarks snapshot failed", e);
        setError(e?.message || "Failed to load bookmarks");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [uid]);

  const detectActiveTab = useCallback(async () => {
    if (!inExtension) return;
    setCurrentDetectStatus("loading");
    const tab = await getActiveTab();
    const url = tab?.url;
    const parsed = parseGithubUrl(url);
    if (parsed) {
      setCurrentRepo({ ...parsed });
      setCurrentDetectStatus("ok");
    } else {
      setCurrentRepo(null);
      setCurrentDetectStatus(url ? "not-github" : "no-tab");
    }
  }, [inExtension]);

  useEffect(() => {
    detectActiveTab();
    if (!inExtension) return undefined;
    // Re-detect when the user switches tabs / nav happens. chrome.tabs events
    // require the "tabs" permission, declared in manifest.json.
    const onActivated = () => detectActiveTab();
    const onUpdated = (_id, info) => {
      if (info.url || info.status === "complete") detectActiveTab();
    };
    try {
      chrome.tabs.onActivated.addListener(onActivated);
      chrome.tabs.onUpdated.addListener(onUpdated);
    } catch {
      /* ignore */
    }
    return () => {
      try {
        chrome.tabs.onActivated.removeListener(onActivated);
        chrome.tabs.onUpdated.removeListener(onUpdated);
      } catch {
        /* ignore */
      }
    };
  }, [detectActiveTab, inExtension]);

  // Existing bookmark for the active URL (used to flip the button to "Remove").
  const currentBookmark = useMemo(() => {
    if (!currentRepo) return null;
    return bookmarks.find((b) => b.url === currentRepo.url) || null;
  }, [currentRepo, bookmarks]);

  const addBookmarkFromParsed = useCallback(
    async (parsed) => {
      if (!uid || !parsed) return;
      // Dedup.
      if (bookmarks.some((b) => b.url === parsed.url)) {
        setError(null);
        return;
      }
      setAdding(true);
      setError(null);
      try {
        const id = newId();
        await setDoc(doc(db, "users", uid, "bookmarks", id), {
          id,
          url: parsed.url,
          owner: parsed.owner,
          repo: parsed.repo,
          kind: parsed.kind,
          path: parsed.path || "",
          title: parsed.title,
          createdAt: serverTimestamp(),
        });
      } catch (e) {
        setError(e?.message || "Could not bookmark");
      } finally {
        setAdding(false);
      }
    },
    [uid, bookmarks],
  );

  const removeBookmark = useCallback(
    async (id) => {
      if (!uid) return;
      try {
        await deleteDoc(doc(db, "users", uid, "bookmarks", id));
      } catch (e) {
        setError(e?.message || "Could not remove bookmark");
      }
    },
    [uid],
  );

  const submitPaste = useCallback(async () => {
    const parsed = parseGithubUrl(pasteUrl.trim());
    if (!parsed) {
      setError("That doesn't look like a GitHub repo URL.");
      return;
    }
    await addBookmarkFromParsed(parsed);
    setPasteUrl("");
  }, [pasteUrl, addBookmarkFromParsed]);

  return (
    <div className="flex flex-col gap-3" data-testid="bookmarks-panel">
      {/* Current-tab detector */}
      {inExtension ? (
        <CurrentTabCard
          status={currentDetectStatus}
          parsed={currentRepo}
          existing={currentBookmark}
          adding={adding}
          onBookmark={() => addBookmarkFromParsed(currentRepo)}
          onUnbookmark={() => currentBookmark && removeBookmark(currentBookmark.id)}
          onRefresh={detectActiveTab}
        />
      ) : (
        <PasteCard
          value={pasteUrl}
          onChange={setPasteUrl}
          onSubmit={submitPaste}
          adding={adding}
        />
      )}

      {error && (
        <div className="rounded-xl border border-[#FF3B30]/40 bg-[#FF3B30]/10 px-3 py-2 text-xs text-[#FF8A82]">
          {error}
        </div>
      )}

      {/* List */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-white/60" />
        </div>
      )}

      {!loading && bookmarks.length === 0 && !error && (
        <div
          className="rounded-2xl border-2 border-dashed border-white/10 p-6 text-center text-sm text-white/60"
          data-testid="bookmarks-empty"
        >
          No bookmarks yet. Hit the bookmark button while on a GitHub repo, PR,
          or file to save it here.
        </div>
      )}

      <ul className="flex flex-col gap-2" data-testid="bookmarks-list">
        {bookmarks.map((b) => (
          <BookmarkItem
            key={b.id}
            bm={b}
            onOpen={() => openUrl(b.url)}
            onRemove={() => removeBookmark(b.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function kindIcon(kind) {
  if (kind === "pull") return GitPullRequest;
  if (kind === "issues") return CircleDot;
  if (kind === "blob") return FileCode2;
  if (kind === "tree") return Folder;
  return GitBranch;
}

function CurrentTabCard({
  status,
  parsed,
  existing,
  adding,
  onBookmark,
  onUnbookmark,
  onRefresh,
}) {
  const Icon = parsed ? kindIcon(parsed.kind) : Bookmark;
  const containerClass =
    "rounded-2xl border-2 border-white/10 bg-[#141414] p-3 flex items-center gap-3";

  if (status === "loading") {
    return (
      <div className={containerClass} data-testid="current-tab-loading">
        <Loader2 className="h-5 w-5 animate-spin text-white/50" />
        <div className="text-xs text-white/60">Detecting current tab...</div>
      </div>
    );
  }

  if (!parsed) {
    return (
      <div
        className={containerClass}
        data-testid={`current-tab-${status}`}
      >
        <Bookmark className="h-5 w-5 shrink-0 text-white/40" />
        <div className="min-w-0 flex-1 text-xs text-white/60">
          {status === "no-tab"
            ? "No active tab detected."
            : "You're not on a GitHub repo. Open a repo, PR, or file and tap refresh."}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          data-testid="current-tab-refresh"
          className="rounded-md p-1 text-white/40 hover:text-white"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const isBookmarked = !!existing;

  return (
    <div className={containerClass} data-testid="current-tab-detected">
      <Icon
        className={`h-5 w-5 shrink-0 ${isBookmarked ? "text-[#CCFF00]" : "text-white/70"}`}
        strokeWidth={2.4}
      />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-widest text-white/40">
          Current tab
        </div>
        <div className="truncate font-heading text-sm font-bold text-white">
          {parsed.title}
        </div>
      </div>
      {isBookmarked ? (
        <button
          type="button"
          onClick={onUnbookmark}
          data-testid="current-tab-unbookmark"
          className="btn-push btn-ghost flex shrink-0 items-center gap-1 px-3 py-1.5 text-xs"
          title="Remove bookmark"
        >
          <Check className="h-3.5 w-3.5 text-[#CCFF00]" strokeWidth={3.5} />
          Saved
        </button>
      ) : (
        <button
          type="button"
          onClick={onBookmark}
          disabled={adding}
          data-testid="current-tab-bookmark"
          className="btn-push btn-level flex shrink-0 items-center gap-1 px-3 py-1.5 text-xs"
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bookmark className="h-3.5 w-3.5" strokeWidth={3} />}
          Save
        </button>
      )}
    </div>
  );
}

function PasteCard({ value, onChange, onSubmit, adding }) {
  return (
    <div
      className="rounded-2xl border-2 border-dashed border-white/15 bg-[#141414] p-3"
      data-testid="bookmarks-paste-card"
    >
      <div className="font-mono text-[10px] uppercase tracking-widest text-white/40">
        Add a bookmark
      </div>
      <div className="mt-1 mb-2 text-[11px] text-white/60">
        The "bookmark current tab" button only works inside the installed Chrome
        extension. While in the web preview, paste a GitHub URL here.
      </div>
      <div className="flex items-stretch gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="https://github.com/owner/repo/..."
          data-testid="bookmarks-paste-input"
          className="min-w-0 flex-1 rounded-xl border-2 border-white/10 bg-black/40 px-3 py-2 text-sm placeholder:text-white/30 focus:border-[#CCFF00]/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim() || adding}
          data-testid="bookmarks-paste-submit"
          className="btn-push btn-level flex items-center gap-1 px-3 py-2 text-xs"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={3} />}
          Save
        </button>
      </div>
    </div>
  );
}

function BookmarkItem({ bm, onOpen, onRemove }) {
  const Icon = kindIcon(bm.kind);
  return (
    <li
      data-testid={`bookmark-row-${bm.id}`}
      className="flex items-center gap-3 rounded-2xl border-2 border-white/10 bg-[#141414] p-3"
    >
      <button
        type="button"
        onClick={onOpen}
        data-testid={`bookmark-open-${bm.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        title={bm.url}
      >
        <Icon className="h-5 w-5 shrink-0 text-white/70" strokeWidth={2.4} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-sm font-bold text-white">
            {bm.title || `${bm.owner}/${bm.repo}`}
          </div>
          <div className="truncate font-mono text-[10px] text-white/50">
            {bm.kind === "repo"
              ? `${bm.owner}/${bm.repo}`
              : `${bm.owner}/${bm.repo} · ${bm.kind}${bm.path ? ` · ${bm.path}` : ""}`}
          </div>
        </div>
        <ExternalLink className="h-4 w-4 shrink-0 text-white/30" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        data-testid={`bookmark-delete-${bm.id}`}
        className="shrink-0 rounded-md p-1 text-white/40 hover:text-[#FF8A82]"
        title="Remove bookmark"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
