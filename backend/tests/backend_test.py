"""
RepUp backend API tests.

Covers:
- /api/health
- /api/daily-challenge (generation, schema, cache, deterministic language assignment)
- /api/grade (correct submission, wrong submission, speed_bonus mapping)
- CORS headers
"""
import os
import time
import hashlib
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fallback to frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.strip().split("=", 1)[1].strip().strip('"')
                    break
    except Exception:
        pass

assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
BASE_URL = BASE_URL.rstrip("/")

# Generous timeouts because Gemini calls can take 5-30s
GEN_TIMEOUT = 90
GRADE_TIMEOUT = 90
LANGUAGES = ["python", "javascript", "typescript", "go", "rust"]

REQUIRED_KEYS = {
    "language", "title", "objective", "buggy_code",
    "expected_behavior", "test_inputs", "expected_outputs",
    "hints", "id", "date",
}


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------------------------------------------------------- /api/health
class TestHealth:
    def test_health_status(self, session):
        r = session.get(f"{BASE_URL}/api/health", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert data["gemini_configured"] is True
        assert data["model"] == "gemini-2.5-pro"

    def test_cors_on_health(self, session):
        # Simulate a browser request with Origin header
        r = session.get(
            f"{BASE_URL}/api/health",
            headers={"Origin": "https://example.com"},
            timeout=15,
        )
        assert r.status_code == 200
        # FastAPI CORSMiddleware with allow_origins="*" reflects "*" (or origin)
        acao = r.headers.get("access-control-allow-origin")
        assert acao is not None, "Missing Access-Control-Allow-Origin header"
        assert acao in ("*", "https://example.com")


# --------------------------------------------------------- /api/daily-challenge
@pytest.fixture(scope="module")
def challenge_a(session):
    """Generate a synthetic challenge once and reuse for schema + cache tests."""
    date = "2026-test-A1"
    t0 = time.time()
    r = session.get(f"{BASE_URL}/api/daily-challenge", params={"date": date}, timeout=GEN_TIMEOUT)
    elapsed = time.time() - t0
    assert r.status_code == 200, f"daily-challenge failed: {r.status_code} {r.text[:300]}"
    return {"date": date, "data": r.json(), "elapsed": elapsed}


class TestDailyChallenge:
    def test_schema_complete(self, challenge_a):
        data = challenge_a["data"]
        missing = REQUIRED_KEYS - set(data.keys())
        assert not missing, f"Missing keys in challenge: {missing}"
        assert data["id"] == challenge_a["date"]
        assert data["date"] == challenge_a["date"]
        assert data["language"] in LANGUAGES
        assert isinstance(data["title"], str) and data["title"].strip()
        assert isinstance(data["objective"], str) and data["objective"].strip()
        assert isinstance(data["buggy_code"], str) and len(data["buggy_code"]) > 20
        assert isinstance(data["expected_behavior"], str)
        assert isinstance(data["test_inputs"], list) and len(data["test_inputs"]) >= 1
        assert isinstance(data["expected_outputs"], list) and len(data["expected_outputs"]) >= 1
        assert isinstance(data["hints"], list) and len(data["hints"]) >= 1

    def test_language_deterministic(self, challenge_a):
        date = challenge_a["date"]
        h = int(hashlib.sha256(date.encode()).hexdigest(), 16)
        expected_lang = LANGUAGES[h % len(LANGUAGES)]
        assert challenge_a["data"]["language"] == expected_lang

    def test_cache_hit_is_fast_and_identical(self, session, challenge_a):
        date = challenge_a["date"]
        t0 = time.time()
        r = session.get(f"{BASE_URL}/api/daily-challenge", params={"date": date}, timeout=15)
        elapsed = time.time() - t0
        assert r.status_code == 200
        # Second hit should be near-instant (cache). Allow a generous 5s budget.
        assert elapsed < 5.0, f"Cache hit too slow: {elapsed:.2f}s"
        assert r.json() == challenge_a["data"], "Cached response differs from first response"

    def test_different_dates_produce_deterministic_languages(self, session):
        """Hit several synthetic dates and verify language matches sha256(date) % 5.
        We also try to find at least two dates that produce different languages
        to confirm the modulo distribution actually varies.
        """
        # Pick dates engineered to map to different languages
        candidates = [
            "2026-test-LangProbe-01",
            "2026-test-LangProbe-02",
            "2026-test-LangProbe-03",
            "2026-test-LangProbe-04",
            "2026-test-LangProbe-05",
        ]
        # First, validate the theoretical mapping spans at least 2 languages
        theoretical = {
            d: LANGUAGES[int(hashlib.sha256(d.encode()).hexdigest(), 16) % 5]
            for d in candidates
        }
        assert len(set(theoretical.values())) >= 2, \
            f"Test setup error: candidates only map to {set(theoretical.values())}"

        # Now hit each and confirm backend matches the theoretical mapping.
        # To minimize Gemini cost we only fetch two candidates with differing langs.
        seen = {}
        for d in candidates:
            if len(seen) >= 2 and len(set(seen.values())) >= 2:
                break
            r = session.get(
                f"{BASE_URL}/api/daily-challenge",
                params={"date": d},
                timeout=GEN_TIMEOUT,
            )
            assert r.status_code == 200, f"daily-challenge failed for {d}: {r.text[:200]}"
            actual_lang = r.json()["language"]
            assert actual_lang == theoretical[d], (
                f"Lang mismatch for {d}: expected {theoretical[d]}, got {actual_lang}"
            )
            seen[d] = actual_lang

        assert len(set(seen.values())) >= 2, (
            f"Did not observe >=2 distinct languages across dates: {seen}"
        )


# --------------------------------------------------------------------- /api/grade
@pytest.fixture(scope="module")
def python_challenge(session):
    """A Python challenge we can construct submissions for."""
    # Custom synthetic buggy code that we know is python with a simple bug
    return {
        "challenge_id": "2026-test-grade-fixture",
        "language": "python",
        "objective": "Sum the numbers in the list. The function should return the total sum.",
        "buggy_code": (
            "def sum_list(nums):\n"
            "    total = 1  # BUG: should start at 0\n"
            "    for n in nums:\n"
            "        total += n\n"
            "    return total\n"
            "\n"
            "if __name__ == '__main__':\n"
            "    print(sum_list([1,2,3,4]))\n"
        ),
    }


class TestGrade:
    def test_grade_correct_fix(self, session, python_challenge):
        correct_user_code = (
            "def sum_list(nums):\n"
            "    total = 0\n"
            "    for n in nums:\n"
            "        total += n\n"
            "    return total\n"
            "\n"
            "if __name__ == '__main__':\n"
            "    print(sum_list([1,2,3,4]))\n"
        )
        payload = {**python_challenge, "user_code": correct_user_code, "elapsed_seconds": 90}
        r = session.post(f"{BASE_URL}/api/grade", json=payload, timeout=GRADE_TIMEOUT)
        assert r.status_code == 200, f"grade failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert data["correct"] is True, f"Expected correct=True, got {data}"
        assert data["score"] >= 80, f"Expected score>=80, got {data['score']}"
        assert data["total"] <= 150
        assert isinstance(data["feedback"], str) and data["feedback"].strip()

    def test_grade_wrong_submission(self, session, python_challenge):
        # User just keeps the original buggy code - clearly wrong
        wrong_user_code = python_challenge["buggy_code"]
        payload = {**python_challenge, "user_code": wrong_user_code, "elapsed_seconds": 60}
        r = session.post(f"{BASE_URL}/api/grade", json=payload, timeout=GRADE_TIMEOUT)
        assert r.status_code == 200, f"grade failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert data["correct"] is False, f"Expected correct=False, got {data}"
        assert data["score"] < 60, f"Expected score<60, got {data['score']}"

    @pytest.mark.parametrize(
        "elapsed,expected_bonus",
        [
            (60, 50),     # <=120
            (250, 30),    # <=300
            (500, 15),    # <=600
            (1200, 5),    # >600
        ],
    )
    def test_speed_bonus_mapping(self, session, python_challenge, elapsed, expected_bonus):
        # Use the correct fix so the model is confident and consistent
        correct_user_code = (
            "def sum_list(nums):\n"
            "    total = 0\n"
            "    for n in nums:\n"
            "        total += n\n"
            "    return total\n"
        )
        payload = {**python_challenge, "user_code": correct_user_code, "elapsed_seconds": elapsed}
        r = session.post(f"{BASE_URL}/api/grade", json=payload, timeout=GRADE_TIMEOUT)
        assert r.status_code == 200, f"grade failed: {r.text[:300]}"
        data = r.json()
        assert data["speed_bonus"] == expected_bonus, (
            f"For elapsed={elapsed} expected speed_bonus={expected_bonus}, "
            f"got {data['speed_bonus']} (full response: {data})"
        )


# --------------------------------------------------------------------- CORS
class TestCORS:
    def test_cors_on_daily_challenge(self, session):
        # Use a date we already cached so this is fast
        r = session.get(
            f"{BASE_URL}/api/daily-challenge",
            params={"date": "2026-test-A1"},
            headers={"Origin": "https://example.com"},
            timeout=20,
        )
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") in ("*", "https://example.com")

    def test_cors_preflight_on_grade(self, session):
        r = session.options(
            f"{BASE_URL}/api/grade",
            headers={
                "Origin": "https://example.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
            timeout=15,
        )
        assert r.status_code in (200, 204), f"preflight failed: {r.status_code}"
        assert r.headers.get("access-control-allow-origin") in ("*", "https://example.com")
        allow_methods = (r.headers.get("access-control-allow-methods") or "").upper()
        assert "POST" in allow_methods or allow_methods == "*"
