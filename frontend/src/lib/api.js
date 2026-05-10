const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export async function fetchDailyChallenge(date) {
  const url = date ? `${API}/daily-challenge?date=${date}` : `${API}/daily-challenge`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`daily-challenge ${res.status}`);
  return res.json();
}

export async function gradeSubmission(payload) {
  const res = await fetch(`${API}/grade`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`grade ${res.status}`);
  return res.json();
}
