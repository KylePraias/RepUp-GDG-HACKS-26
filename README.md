# RepUp — Duolingo for Developers

RepUp is a Chrome extension that gamifies your coding habits. Build daily streaks, earn XP, beat coding challenges, and get real-time AI code reviews injected directly into GitHub — all without leaving your workflow.

## Features

### 🔥 Daily Streaks & XP
Track your GitHub activity (commits, pull requests, READMEs, issue comments) and earn XP every day. Level up as you code more consistently.

### ⚔️ Daily Coding Challenge
A new bugfix challenge every day in a randomly selected language (Python, JavaScript, TypeScript, Go, Rust). Solve it fast for a speed bonus. Top scores go on the leaderboard.

### 🤖 AI Code Review Sidebar
A Shadow DOM sidebar injected directly into GitHub that reviews any file or PR diff using Google Gemini. Get instant feedback on bugs, security vulnerabilities, performance issues, and code smells — without leaving GitHub.

### 🏆 Leaderboard
Compete on the daily challenge leaderboard. Only correct solutions appear — partial credit is awarded for near-misses but kept off the board.

### 🎨 Decoration Shop
Spend XP on cosmetic themes and decorations to personalise your RepUp experience.

### 📝 Todo List & Repo Bookmarks
Manage your dev tasks and bookmark frequently visited GitHub repos directly inside the extension.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React, Tailwind CSS, Chrome Extension MV3 |
| Backend | Python, FastAPI, Uvicorn |
| AI | Google Gemini 2.5 Pro |
| Database | Firebase Firestore |
| Auth | Firebase Auth, GitHub OAuth |
| Hosting | Google Cloud Run |
| APIs | GitHub REST API, Chrome Identity, Chrome Storage, Chrome Side Panel |

---

## Getting Started

### Prerequisites
- Node.js + Yarn
- Python 3.11+
- A Firebase project
- A GitHub OAuth App
- A Gemini API key
- Google Cloud CLI (for deployment)

### Frontend Setup
```bash
cd frontend
yarn install
```

Create `frontend/.env`:
```
REACT_APP_BACKEND_URL=https://your-backend-url.run.app
REACT_APP_GH_OAUTH_CLIENT_ID=your_github_oauth_client_id
```

### Backend Setup
```bash
cd backend
pip install -r requirements.txt
```

Create `backend/.env`:
```
GEMINI_API_KEY=your_gemini_api_key
GITHUB_OAUTH_CLIENT_ID=your_github_oauth_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_github_oauth_client_secret
CORS_ORIGINS=*
```

Run locally:
```bash
uvicorn server:app --reload --port 8080
```

### Build the Extension
```bash
node scripts/build-extension.js
```

Then load `extension/` as an unpacked extension in `chrome://extensions`.

---

## Deployment

### Deploy Backend to Google Cloud Run
```bash
cd backend
gcloud run deploy repup-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

Set environment variables:
```bash
gcloud run services update repup-backend \
  --region us-central1 \
  --set-env-vars GEMINI_API_KEY=...,GITHUB_OAUTH_CLIENT_ID=...,GITHUB_OAUTH_CLIENT_SECRET=...,CORS_ORIGINS=*
```

---

## Project Structure

```
RepUp/
├── backend/          # FastAPI server
├── extension/        # Built Chrome extension (load this in Chrome)
├── frontend/         # React source code
├── scripts/          # Build scripts
└── PRIVACY.md        # Privacy policy
```

---

## Privacy

See [PRIVACY.md](./PRIVACY.md) for full details on data collection and usage.

---

## License

MIT