from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timezone
import os
import json
import hashlib
import logging
import asyncio
import httpx

from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-2.5-pro"

LANGUAGES = ["python", "javascript", "typescript", "go", "rust"]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("repup")

app = FastAPI(title="RepUp API")
api = APIRouter(prefix="/api")

# In-memory cache: date -> challenge dict (so all users see the same challenge for the day)
_challenge_cache: dict = {}


class GradeRequest(BaseModel):
    challenge_id: str
    language: str
    objective: str
    buggy_code: str
    user_code: str
    elapsed_seconds: float


def _pick_language(date_str: str) -> str:
    h = int(hashlib.sha256(date_str.encode()).hexdigest(), 16)
    return LANGUAGES[h % len(LANGUAGES)]


def _strip_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        # remove first fence
        t = t.split("```", 2)
        # parts: ['', 'json\n...content', '']  or ['', 'lang\n...']
        body = t[1] if len(t) > 1 else ""
        if body.lower().startswith("json"):
            body = body[4:]
        # cut trailing fence if present
        if "```" in body:
            body = body.rsplit("```", 1)[0]
        return body.strip()
    return t


async def _generate_challenge(date_str: str) -> dict:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    lang = _pick_language(date_str)
    system_msg = (
        "You are a senior staff engineer who designs short daily coding challenges "
        "for developers. Always respond with ONLY valid JSON. No markdown, no prose."
    )

    chat = LlmChat(
        api_key=GEMINI_API_KEY,
        session_id=f"daily-{date_str}",
        system_message=system_msg,
    ).with_model("gemini", GEMINI_MODEL)

    prompt = f"""Generate ONE small coding challenge for date {date_str} in language: {lang}.

Output JSON with EXACTLY this shape (no other keys, no markdown):
{{
  "language": "{lang}",
  "title": "<a short, punchy, slightly playful title>",
  "objective": "<1-2 sentences describing what the user must fix in plain English>",
  "buggy_code": "<a SELF-CONTAINED {lang} program, 20-50 lines, that PARSES and COMPILES fine but contains 2-4 LOGIC bugs the user must fix. No external dependencies beyond stdlib. Use \\n for newlines.>",
  "expected_behavior": "<what the correctly fixed program should do for given inputs>",
  "test_inputs": ["<short input description 1>", "<short input description 2>"],
  "expected_outputs": ["<expected output 1>", "<expected output 2>"],
  "hints": ["<a small hint>", "<another small hint>"]
}}

Rules:
- Bugs must be subtle but solvable in under 5 minutes by an intermediate developer.
- DO NOT use syntax errors. The code must run; it just produces wrong output.
- Keep it short and self-contained.
"""
    raw = await chat.send_message(UserMessage(text=prompt))
    body = _strip_fences(raw)
    data = json.loads(body)
    data["id"] = date_str
    data["date"] = date_str
    return data


@api.get("/health")
async def health():
    return {
        "status": "ok",
        "gemini_configured": bool(GEMINI_API_KEY),
        "model": GEMINI_MODEL,
        "github_oauth_configured": bool(
            os.environ.get("GITHUB_OAUTH_CLIENT_ID")
            and os.environ.get("GITHUB_OAUTH_CLIENT_SECRET")
        ),
        "time": datetime.now(timezone.utc).isoformat(),
    }


@api.get("/github/exchange")
async def github_exchange(code: str, redirect_uri: Optional[str] = None):
    """Exchange a GitHub OAuth `code` for an `access_token`.

    Used by the Chrome extension's `chrome.identity.launchWebAuthFlow` flow.
    The browser cannot keep the GitHub Client Secret, so the extension hands us
    the short-lived code and we exchange it server-side.
    """
    client_id = os.environ.get("GITHUB_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("GITHUB_OAUTH_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=500,
            detail="GitHub OAuth not configured on backend. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET in backend/.env.",
        )
    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
    }
    if redirect_uri:
        payload["redirect_uri"] = redirect_uri
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.post(
                "https://github.com/login/oauth/access_token",
                data=payload,
                headers={"Accept": "application/json"},
            )
    except Exception as e:
        logger.exception("github exchange request failed")
        raise HTTPException(status_code=502, detail=f"GitHub upstream error: {e}")

    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"GitHub returned {r.status_code}")
    data = r.json()
    if data.get("error"):
        raise HTTPException(
            status_code=400,
            detail=f"{data.get('error')}: {data.get('error_description', '')}",
        )
    token = data.get("access_token")
    if not token:
        raise HTTPException(status_code=502, detail="No access_token in GitHub response")
    return {"access_token": token, "scope": data.get("scope"), "token_type": data.get("token_type")}


@api.get("/daily-challenge")
async def daily_challenge(date: Optional[str] = None):
    today = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if today in _challenge_cache:
        return _challenge_cache[today]
    try:
        challenge = await _generate_challenge(today)
    except Exception as e:
        logger.exception("daily-challenge generation failed")
        raise HTTPException(status_code=500, detail=f"Failed to generate challenge: {e}")
    _challenge_cache[today] = challenge
    return challenge


@api.post("/grade")
async def grade(req: GradeRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    system_msg = (
        "You are a strict but fair automated code reviewer. "
        "You evaluate whether a user's submission correctly fixes the bugs in the "
        "ORIGINAL buggy code, given the OBJECTIVE. Respond ONLY with valid JSON."
    )
    chat = LlmChat(
        api_key=GEMINI_API_KEY,
        session_id=f"grade-{req.challenge_id}-{datetime.now(timezone.utc).timestamp()}",
        system_message=system_msg,
    ).with_model("gemini", GEMINI_MODEL)

    prompt = f"""Evaluate the user's submission.

LANGUAGE: {req.language}
OBJECTIVE: {req.objective}

ORIGINAL BUGGY CODE:
```{req.language}
{req.buggy_code}
```

USER SUBMISSION:
```{req.language}
{req.user_code}
```

ELAPSED_SECONDS: {req.elapsed_seconds}

Return ONLY this JSON (no markdown fences):
{{
  "correct": <true|false>,
  "score": <integer 0-100, correctness ONLY>,
  "speed_bonus": <integer 0-50: 50 if elapsed_seconds<=120, 30 if <=300, 15 if <=600, 5 otherwise>,
  "total": <score + speed_bonus>,
  "feedback": "<2-3 short, friendly sentences. Mention what was fixed or what was missed.>"
}}"""

    try:
        raw = await chat.send_message(UserMessage(text=prompt))
        body = _strip_fences(raw)
        result = json.loads(body)
    except Exception as e:
        logger.exception("grading failed")
        raise HTTPException(status_code=500, detail=f"Grading failed: {e}")

    # Defensive normalisation. Compute speed_bonus deterministically server-side
    # (do not trust the model) so the leaderboard is fair and tamper-proof.
    score = max(0, min(100, int(result.get("score", 0))))
    elapsed = max(0.0, float(req.elapsed_seconds))
    if elapsed <= 120:
        speed_bonus = 50
    elif elapsed <= 300:
        speed_bonus = 30
    elif elapsed <= 600:
        speed_bonus = 15
    else:
        speed_bonus = 5
    correct = bool(result.get("correct", False))
    # No correctness => no speed bonus rewarded toward total
    total = score + (speed_bonus if correct else 0)
    return {
        "correct": correct,
        "score": score,
        "speed_bonus": speed_bonus,
        "total": total,
        "feedback": str(result.get("feedback", "")),
        "elapsed_seconds": elapsed,
    }


# =====================================================================
# Code Review (Gemini-powered, SSE-streamed)
# =====================================================================
# Used by the Chrome extension's content-script sidebar that injects into
# github.com PR/file pages. Streams NDJSON events for bugs / security /
# performance / smells / grade. Caching is client-side by file SHA in
# chrome.storage.local — see the content script.


class ReviewRequest(BaseModel):
    code: str = Field(..., max_length=200_000)
    language: Optional[str] = "auto"
    filename: Optional[str] = "snippet"
    # Free-form extra context the extension can attach (e.g. "this is a PR
    # patch — '+' lines are additions, '-' are deletions"). Max ~2 kB.
    context: Optional[str] = Field(default="", max_length=2000)
    # File SHA — passed back in the meta event so the client can confirm
    # what was actually graded. We don't use it server-side.
    sha: Optional[str] = None


REVIEW_SYSTEM = (
    "You are a senior staff engineer doing a thorough code review. You analyze "
    "code rigorously and respond ONLY with valid JSON. No markdown, no prose."
)


def _build_review_prompt(req: ReviewRequest) -> str:
    code = req.code
    # Hard cap to keep prompt + Gemini context window comfortable.
    if len(code) > 60_000:
        code = code[:60_000] + "\n\n/* …truncated for review (file too large) */"
    ctx = (req.context or "").strip()
    return f"""Review the following {req.language or 'auto'} file: {req.filename or 'snippet'}
{f'Context: {ctx}' if ctx else ''}

CODE:
```{(req.language or '').lower() if (req.language or '').lower() != 'auto' else ''}
{code}
```

Return ONLY this JSON shape (no markdown fences, no commentary):
{{
  "bugs":        [<finding>, ...],
  "security":    [<finding>, ...],
  "performance": [<finding>, ...],
  "smells":      [<finding>, ...],
  "grade":       "A+|A|A-|B+|B|B-|C+|C|C-|D|F",
  "score":       <integer 0-100>,
  "summary":     "<2-3 sentence overall assessment>"
}}

Each <finding> must be:
{{
  "severity":    "high|medium|low",
  "title":       "<short headline, <=80 chars>",
  "line":        <integer line number or null>,
  "description": "<1-2 sentence explanation of the issue>",
  "suggestion":  "<concrete fix or recommendation>"
}}

Rules:
- Be specific. Reference variable/function names where relevant.
- If a category is genuinely clean, return [] (NOT a list with "no issues found").
- Cap each category at 8 findings, ranked highest severity first.
- Grade reflects overall quality (security weighted heavily, then bugs, then perf, then smells).
- DO NOT wrap the JSON in markdown fences.
"""


def _ndjson(event: str, payload) -> bytes:
    """One NDJSON line for the streaming response."""
    return (json.dumps({"event": event, "data": payload}) + "\n").encode("utf-8")


@api.post("/review")
async def review(req: ReviewRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    async def gen():
        # 1) Tell the client we got the request and which model we're using.
        yield _ndjson(
            "meta",
            {
                "filename": req.filename,
                "language": req.language,
                "sha": req.sha,
                "model": GEMINI_MODEL,
                "ts": datetime.now(timezone.utc).isoformat(),
            },
        )
        # Tiny artificial delay so the meta event flushes before the first
        # heavyweight token of the Gemini response — keeps the UI responsive.
        await asyncio.sleep(0)

        try:
            chat = LlmChat(
                api_key=GEMINI_API_KEY,
                session_id=f"review-{datetime.now(timezone.utc).timestamp()}",
                system_message=REVIEW_SYSTEM,
            ).with_model("gemini", GEMINI_MODEL)
            raw = await chat.send_message(UserMessage(text=_build_review_prompt(req)))
            body = _strip_fences(raw)
            data = json.loads(body)
        except json.JSONDecodeError as e:
            logger.warning("review json decode failed: %s", e)
            yield _ndjson("error", {"message": f"Bad JSON from model: {e}"})
            return
        except Exception as e:
            logger.exception("review failed")
            yield _ndjson("error", {"message": f"Review failed: {e}"})
            return

        # 2) Stream each category as its own event with a small gap so the
        #    UI gets a "filling in" feel. Cost is exactly one Gemini call.
        for section in ("bugs", "security", "performance", "smells"):
            findings = data.get(section, []) or []
            if not isinstance(findings, list):
                findings = []
            # Defensive normalisation per finding.
            cleaned = []
            for f in findings[:8]:
                if not isinstance(f, dict):
                    continue
                sev = str(f.get("severity", "low")).lower()
                if sev not in ("high", "medium", "low"):
                    sev = "low"
                line = f.get("line")
                try:
                    line = int(line) if line is not None else None
                except (TypeError, ValueError):
                    line = None
                cleaned.append(
                    {
                        "severity": sev,
                        "title": str(f.get("title", "Untitled finding"))[:200],
                        "line": line,
                        "description": str(f.get("description", ""))[:1200],
                        "suggestion": str(f.get("suggestion", ""))[:1200],
                    }
                )
            yield _ndjson(section, cleaned)
            await asyncio.sleep(0.08)

        # 3) Final overall grade event.
        grade = str(data.get("grade", "C")).upper()
        if grade not in {"A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"}:
            grade = "C"
        try:
            score = int(data.get("score", 50))
        except (TypeError, ValueError):
            score = 50
        score = max(0, min(100, score))
        yield _ndjson(
            "grade",
            {
                "letter": grade,
                "score": score,
                "summary": str(data.get("summary", ""))[:1200],
            },
        )

        yield _ndjson("done", {"ok": True})

    return StreamingResponse(
        gen(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            # Disable proxy buffering so the events flush immediately.
            "X-Accel-Buffering": "no",
        },
    )


# Re-mount the router so /review (and any future routes added in this
# section) attach to the FastAPI app. APIRouter routes added after the
# first include_router call need a fresh include_router to register.
app.include_router(api)


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
