// Today's GitHub activity for the user — real-time per-repo strategy.
//
// Pipeline (when a token is present):
//   1. GraphQL contributionsCollection → list of repos the user touched today
//      (commits + PRs + issues — three sources unioned).
//   2. For each repo IN PARALLEL hit four real-time REST endpoints:
//        • commits   → /repos/X/commits?author=Y&since=today
//        • prs       → /repos/X/pulls?creator=Y&state=all&sort=created
//        • readme    → /repos/X/commits?author=Y&since=today&path=README{,md,rst,txt}
//        • comments  → /repos/X/issues/comments?since=today  (filtered to this user)
//   3. De-duplicate by ID/SHA, count.
//
// Without a token we fall back to /events/public, which has ~5 min lag.

const GH = "https://api.github.com";

async function gh(path, token, accept) {
  const headers = { Accept: accept || "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${GH}${path}`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`GitHub ${path} → ${res.status} ${body.slice(0, 120)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function ghGraphQL(query, variables, token) {
  const res = await fetch(`${GH}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GraphQL ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors).slice(0, 200)}`);
  }
  return data.data;
}

function todayUtcStartIso() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  ).toISOString();
}

function todayUtcEndIso() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
  ).toISOString();
}

const TOUCHED_REPOS_QUERY = `
  query Touched($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        commitContributionsByRepository(maxRepositories: 25) {
          repository { nameWithOwner }
        }
        pullRequestContributionsByRepository(maxRepositories: 25) {
          repository { nameWithOwner }
        }
        issueContributionsByRepository(maxRepositories: 25) {
          repository { nameWithOwner }
        }
      }
    }
  }
`;

async function discoverTouchedRepos(login, token) {
  const data = await ghGraphQL(
    TOUCHED_REPOS_QUERY,
    { login, from: todayUtcStartIso(), to: todayUtcEndIso() },
    token,
  );
  const cc = data?.user?.contributionsCollection || {};
  const names = new Set();
  for (const key of [
    "commitContributionsByRepository",
    "pullRequestContributionsByRepository",
    "issueContributionsByRepository",
  ]) {
    for (const entry of cc[key] || []) {
      const n = entry?.repository?.nameWithOwner;
      if (n) names.add(n);
    }
  }
  return Array.from(names);
}

const README_PATHS = ["README.md", "README", "README.rst", "README.txt"];

// Per-repo real-time fetchers. Each returns a Set of unique IDs/SHAs.
async function repoCommitsToday(repo, login, token) {
  const since = todayUtcStartIso();
  const arr = await gh(
    `/repos/${repo}/commits?author=${encodeURIComponent(login)}&since=${since}&per_page=100`,
    token,
  ).catch(() => []);
  const out = new Set();
  for (const c of Array.isArray(arr) ? arr : []) {
    if (c?.sha) out.add(c.sha);
  }
  return out;
}

async function repoReadmeShasToday(repo, login, token) {
  const since = todayUtcStartIso();
  const calls = README_PATHS.map((p) =>
    gh(
      `/repos/${repo}/commits?author=${encodeURIComponent(login)}&since=${since}&path=${encodeURIComponent(p)}&per_page=20`,
      token,
    ).catch(() => []),
  );
  const results = await Promise.all(calls);
  const shas = new Set();
  for (const arr of results) {
    for (const c of Array.isArray(arr) ? arr : []) {
      if (c?.sha) shas.add(c.sha);
    }
  }
  return shas;
}

async function repoPrsCreatedToday(repo, login, token) {
  const since = todayUtcStartIso();
  // List most recent PRs by this user, then filter to created_at >= today.
  const arr = await gh(
    `/repos/${repo}/pulls?state=all&creator=${encodeURIComponent(login)}&sort=created&direction=desc&per_page=20`,
    token,
  ).catch(() => []);
  const ids = new Set();
  for (const pr of Array.isArray(arr) ? arr : []) {
    if (!pr?.created_at) continue;
    if (pr.created_at >= since) ids.add(pr.id);
  }
  return ids;
}

async function repoIssueCommentsToday(repo, login, token) {
  const since = todayUtcStartIso();
  // Issue comments touched today; filter to this user.
  const arr = await gh(
    `/repos/${repo}/issues/comments?since=${since}&per_page=100&sort=created&direction=desc`,
    token,
  ).catch(() => []);
  const ids = new Set();
  const todayPrefix = since.slice(0, 10);
  for (const c of Array.isArray(arr) ? arr : []) {
    if (c?.user?.login !== login) continue;
    if (!c.created_at?.startsWith(todayPrefix)) continue;
    ids.add(c.id);
  }
  return ids;
}

// ---- Slow / fallback path -------------------------------------------------

async function fetchTodayActivityViaEvents(login, token) {
  const path = token
    ? `/users/${login}/events?per_page=100`
    : `/users/${login}/events/public?per_page=100`;
  const events = await gh(path, token).catch(() => []);
  const today = new Date().toISOString().slice(0, 10);
  let commits = 0;
  let prs = 0;
  let readme = 0;
  let issueComments = 0;
  for (const ev of events) {
    if (!ev.created_at || !ev.created_at.startsWith(today)) continue;
    if (ev.type === "PushEvent") {
      const cArr = Array.isArray(ev.payload?.commits) ? ev.payload.commits : [];
      const size =
        typeof ev.payload?.size === "number"
          ? ev.payload.size
          : cArr.length || 1;
      commits += size;
      for (const cm of cArr) {
        if (cm.message && /readme/i.test(cm.message)) readme += 1;
      }
    } else if (ev.type === "PullRequestEvent" && ev.payload?.action === "opened") {
      prs += 1;
    } else if (ev.type === "IssueCommentEvent") {
      issueComments += 1;
    }
  }
  return { commits, prs, readme, issueComments };
}

// ---- Public API -----------------------------------------------------------

export async function fetchTodayActivity(login, token) {
  if (!login) return { commits: 0, prs: 0, readme: 0, issueComments: 0 };

  if (!token) return fetchTodayActivityViaEvents(login, token);

  let repos;
  try {
    repos = await discoverTouchedRepos(login, token);
  } catch (e) {
    console.warn("graphql discover failed, falling back to events feed", e);
    return fetchTodayActivityViaEvents(login, token);
  }

  if (repos.length === 0) {
    // No repos returned yet → fall back to events for the rare race-condition
    // case where contributions haven't been indexed but events already are.
    return fetchTodayActivityViaEvents(login, token);
  }

  // Fan out 4 parallel REST calls per repo. For 3 repos that's 12 requests,
  // all in flight concurrently. Authenticated rate limit is 5000/hour.
  const work = repos.map(async (repo) => {
    const [commitShas, readmeShas, prIds, commentIds] = await Promise.all([
      repoCommitsToday(repo, login, token),
      repoReadmeShasToday(repo, login, token),
      repoPrsCreatedToday(repo, login, token),
      repoIssueCommentsToday(repo, login, token),
    ]);
    return { commitShas, readmeShas, prIds, commentIds };
  });
  const perRepo = await Promise.all(work);

  // Aggregate, de-duplicating across repos by ID/SHA.
  const allCommits = new Set();
  const allReadmes = new Set();
  const allPrs = new Set();
  const allComments = new Set();
  for (const r of perRepo) {
    for (const x of r.commitShas) allCommits.add(x);
    for (const x of r.readmeShas) allReadmes.add(x);
    for (const x of r.prIds) allPrs.add(x);
    for (const x of r.commentIds) allComments.add(x);
  }

  return {
    commits: allCommits.size,
    prs: allPrs.size,
    readme: allReadmes.size,
    issueComments: allComments.size,
  };
}

export async function fetchUserPublic(login, token) {
  return gh(`/users/${login}`, token);
}

// Returns a Set of GitHub logins (lowercased) that the *authenticated* user
// is following. Paginates /user/following at 100/page. Requires a token —
// if no token is provided we throw so callers can prompt re-login.
export async function fetchFollowing(token) {
  if (!token) {
    const err = new Error("GitHub token required to load follows");
    err.code = "no_token";
    throw err;
  }
  const out = new Set();
  let page = 1;
  // Hard cap: 20 pages * 100 = 2000 follows. Safety against runaway loops.
  while (page <= 20) {
    let arr;
    try {
      arr = await gh(`/user/following?per_page=100&page=${page}`, token);
    } catch (e) {
      if (page === 1) throw e;
      // Partial result from earlier pages — return what we have rather than failing.
      break;
    }
    if (!Array.isArray(arr) || arr.length === 0) break;
    for (const u of arr) {
      if (u?.login) out.add(String(u.login).toLowerCase());
    }
    if (arr.length < 100) break;
    page += 1;
  }
  return out;
}
