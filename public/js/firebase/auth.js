// Firebase 익명 인증 모듈
import { getFirebaseInstances } from "./init.js";

let currentUser = null;

export async function ensureAnonymousAuth() {
  const { auth, isReady } = getFirebaseInstances();
  if (!isReady || !auth) {
    return null;
  }

  if (currentUser) {
    return currentUser;
  }

  try {
    const { signInAnonymously, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js");

    return new Promise((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          currentUser = user;
          resolve(user);
        } else {
          try {
            const cred = await signInAnonymously(auth);
            currentUser = cred.user;
            resolve(currentUser);
          } catch (e) {
            console.warn("익명 인증 실패:", e);
            resolve(null);
          }
        }
      });
    });
  } catch (err) {
    console.warn("Firebase Auth 로딩 오류:", err);
    return null;
  }
}

export function getCurrentUser() {
  return currentUser;
}
