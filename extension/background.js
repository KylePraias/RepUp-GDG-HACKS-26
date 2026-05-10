// RepUp background service worker.
// Two responsibilities:
//   1. Open the side panel when the toolbar icon is clicked.
//   2. Proxy /api/review NDJSON streaming requests for the content script.
//      WHY: github.com sets a strict Content-Security-Policy connect-src
//      directive that does NOT include our backend. In Chrome MV3,
//      content-script fetch requests DO inherit the page's CSP, so a
//      direct fetch from gh-review.js is blocked. The background service
//      worker has its own (extension) CSP and is exempt from the page's
//      connect-src, so we route the fetch through here and stream chunks
//      back via a long-lived chrome.runtime.Port.
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((e) => console.warn("sidePanel.setPanelBehavior", e));
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!chrome.sidePanel) return;
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (e) {
    console.warn("sidePanel.open failed", e);
  }
});

// ----------------------------------------------------------------------
// /api/review streaming proxy
// ----------------------------------------------------------------------
// Protocol (content script <-> background, both directions over Port):
//   content -> bg:  { type: "start", url, body }       // body is the JSON
//                                                      // payload object
//   bg      -> content: { type: "chunk", text }        // raw NDJSON chunk
//                                                      // (one or more lines)
//   bg      -> content: { type: "end" }                // stream finished
//   bg      -> content: { type: "error", message }     // fetch / HTTP error
//
// If the content script disconnects (page nav, tab close, abort), we
// cancel the in-flight fetch via AbortController.
// Keep the service worker alive while a review is streaming.
const _keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "repup-review") return;

  const ctrl = new AbortController();
  let started = false;
  // Keepalive: ping every 20s so Chrome doesn't kill the SW mid-stream.
  const keepalive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);

  port.onDisconnect.addListener(() => {
    clearInterval(keepalive);
    try {
      ctrl.abort();
    } catch (_) {
      /* noop */
    }
  });

  port.onMessage.addListener(async (msg) => {
    if (!msg || msg.type !== "start" || started) return;
    started = true;
    const { url, body } = msg;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/x-ndjson" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
        credentials: "omit",
      });
      if (!r.ok || !r.body) {
        const txt = await r.text().catch(() => "");
        try {
          port.postMessage({
            type: "error",
            message: `/api/review ${r.status}: ${txt.slice(0, 200)}`,
          });
        } catch (_) {
          /* port already gone */
        }
        try { port.disconnect(); } catch (_) {}
        return;
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        if (text) {
          try {
            port.postMessage({ type: "chunk", text });
          } catch (_) {
            // Port closed by content script (nav/abort) — stop reading.
            try { ctrl.abort(); } catch (_) {}
            return;
          }
        }
      }
      // Flush remaining bytes in the decoder buffer.
      const tail = decoder.decode();
      if (tail) {
        try { port.postMessage({ type: "chunk", text: tail }); } catch (_) {}
      }
      try { port.postMessage({ type: "end" }); } catch (_) {}
    } catch (e) {
      if (e?.name === "AbortError") {
        try { port.postMessage({ type: "error", message: "aborted" }); } catch (_) {}
      } else {
        try {
          port.postMessage({
            type: "error",
            message: String(e?.message || e || "Unknown fetch error"),
          });
        } catch (_) {}
      }
    } finally {
      clearInterval(keepalive);
      try { port.disconnect(); } catch (_) {}
    }
  });
});
