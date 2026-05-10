import {
  signInWithPopup,
  signInWithCredential,
  GithubAuthProvider,
  signOut as fbSignOut,
} from "firebase/auth";
import { auth, githubProvider } from "../firebase";

const GITHUB_CLIENT_ID_PLACEHOLDER = "REPLACE_WITH_GITHUB_OAUTH_APP_CLIENT_ID";

function inExtension() {
  return (
    typeof window !== "undefined" &&
    typeof window.chrome !== "undefined" &&
    !!window.chrome?.identity?.launchWebAuthFlow
  );
}

// Web-preview / dev: classic Firebase popup
async function signInWebPopup() {
  const result = await signInWithPopup(auth, githubProvider);
  const credential = GithubAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken || null;
  return { user: result.user, accessToken };
}

// Chrome extension: chrome.identity.launchWebAuthFlow → GitHub access token → Firebase signInWithCredential
async function signInExtension() {
  // The extension needs its own GitHub OAuth App configured with a redirect URL of:
  //   https://<extension-id>.chromiumapp.org/
  // Set REACT_APP_GH_OAUTH_CLIENT_ID in /app/frontend/.env at build time.
  const clientId =
    process.env.REACT_APP_GH_OAUTH_CLIENT_ID ||
    GITHUB_CLIENT_ID_PLACEHOLDER;

  if (clientId === GITHUB_CLIENT_ID_PLACEHOLDER) {
    throw new Error(
      "GitHub OAuth Client ID missing. Set REACT_APP_GH_OAUTH_CLIENT_ID in frontend/.env and rebuild.",
    );
  }

  const redirectUri = window.chrome.identity.getRedirectURL();
  const scopes = encodeURIComponent("read:user public_repo");
  const authUrl =
    `https://github.com/login/oauth/authorize?client_id=${clientId}` +
    `&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  const responseUrl = await new Promise((resolve, reject) => {
    window.chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (url) => {
        if (window.chrome.runtime.lastError || !url)
          return reject(window.chrome.runtime.lastError || new Error("No response"));
        resolve(url);
      },
    );
  });

  const code = new URL(responseUrl).searchParams.get("code");
  if (!code) throw new Error("No GitHub OAuth code");

  // Exchange code for token via backend (since GitHub requires client_secret)
  const exchangeUrl = `${process.env.REACT_APP_BACKEND_URL}/api/github/exchange?code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  const tokenRes = await fetch(exchangeUrl);
  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => "");
    throw new Error(`token exchange failed (${tokenRes.status}): ${errText}`);
  }
  const { access_token } = await tokenRes.json();
  if (!access_token) throw new Error("Backend returned no access_token");

  const credential = GithubAuthProvider.credential(access_token);
  const result = await signInWithCredential(auth, credential);
  return { user: result.user, accessToken: access_token };
}

export async function signInWithGitHub() {
  if (inExtension()) return signInExtension();
  return signInWebPopup();
}

export async function signOut() {
  await fbSignOut(auth);
  try {
    sessionStorage.removeItem("repup_gh_token");
  } catch (e) {
    /* ignore */
  }
}
