// Firebase 초기화 모듈
import { firebaseConfig, isFirebaseConfigured } from "./config.js";

let app = null;
let auth = null;
let db = null;
let isReady = false;

export async function initFirebase() {
  if (!isFirebaseConfigured) {
    console.info("ℹ️ Firebase 설정이 비어 있어 로컬 모드(localStorage)로 동작합니다.");
    return { app: null, auth: null, db: null, isOnline: false };
  }

  if (isReady) {
    return { app, auth, db, isOnline: true };
  }

  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js");
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js");
    const { getFirestore } = await import("https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js");

    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    isReady = true;

    console.info("🔥 Firebase 연동 완료 (Auth, Firestore)");
    return { app, auth, db, isOnline: true };
  } catch (err) {
    console.warn("⚠️ Firebase 초기화 실패, 로컬 모드로 전환합니다:", err);
    return { app: null, auth: null, db: null, isOnline: false };
  }
}

export function getFirebaseInstances() {
  return { app, auth, db, isReady };
}
