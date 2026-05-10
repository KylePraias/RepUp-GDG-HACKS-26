import { initializeApp } from "firebase/app";
import { getAuth, GithubAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// RepUp Firebase project (provided by app owner). Client-side keys are public.
const firebaseConfig = {
  apiKey: "AIzaSyB6OpEP2EDDrDfjIqjsLjSHytbQ_ZPfN5I",
  authDomain: "repup-7a1cb.firebaseapp.com",
  databaseURL: "https://repup-7a1cb-default-rtdb.firebaseio.com",
  projectId: "repup-7a1cb",
  storageBucket: "repup-7a1cb.firebasestorage.app",
  messagingSenderId: "72945533285",
  appId: "1:72945533285:web:dc9452d4ca408430f1e18c",
  measurementId: "G-9RJJ8VD4WM",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const githubProvider = new GithubAuthProvider();
githubProvider.addScope("read:user");
githubProvider.addScope("public_repo");
