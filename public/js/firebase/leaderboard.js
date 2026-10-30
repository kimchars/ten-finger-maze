// 온라인(Firestore) 및 오프라인(localStorage) 하이브리드 순위표
import { getFirebaseInstances } from "./init.js";
import { ensureAnonymousAuth, getCurrentUser } from "./auth.js";
import { store, LOCAL_BOARD_KEY, TRIAL_BOARD_KEY } from "../store.js";

// kind: "race" = 5단계 레이스, "trial" = 1~3단계 체험
const COLLECTION = { race: "leaderboard", trial: "trialboard" };
const LOCAL_KEY = { race: LOCAL_BOARD_KEY, trial: TRIAL_BOARD_KEY };

function sortBoard(b) {
  return b.sort((x, y) => x.time - y.time || x.deaths - y.deaths || x.at - y.at);
}

export async function fetchLeaderboard(kind = "race") {
  const { db, isReady } = getFirebaseInstances();

  if (isReady && db) {
    try {
      const { collection, getDocs, query, orderBy, limit } = await import(
        "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js"
      );
      const q = query(collection(db, COLLECTION[kind]), orderBy("time", "asc"), limit(50));
      const snap = await getDocs(q);
      const results = [];
      snap.forEach((doc) => {
        results.push({ id: doc.id, ...doc.data() });
      });
      return { board: sortBoard(results), isCloud: true };
    } catch (err) {
      console.warn("Firestore 순위표 조회 실패, 로컬 기록을 표시합니다:", err);
    }
  }

  // 로컬 fallback
  const local = store.get(LOCAL_KEY[kind], []);
  return { board: sortBoard(Array.isArray(local) ? local : []), isCloud: false };
}

export async function submitScore(entry, kind = "race") {
  // 1. 항상 로컬 스토리지에 백업 저장
  const local = store.get(LOCAL_KEY[kind], []);
  const updatedLocal = sortBoard([...(Array.isArray(local) ? local : []), entry]).slice(0, 50);
  store.set(LOCAL_KEY[kind], updatedLocal);

  const { db, isReady } = getFirebaseInstances();
  if (isReady && db) {
    try {
      await ensureAnonymousAuth();
      const user = getCurrentUser();
      const { collection, addDoc } = await import(
        "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js"
      );
      const docRef = await addDoc(collection(db, COLLECTION[kind]), {
        name: entry.name,
        time: entry.time,
        deaths: entry.deaths,
        at: entry.at,
        uid: user ? user.uid : "anonymous",
      });
      return { id: docRef.id, isCloud: true };
    } catch (err) {
      console.warn("Firestore 점수 업로드 실패, 로컬에만 저장됨:", err);
    }
  }

  return { id: entry.id, isCloud: false };
}

export async function clearLocalLeaderboard(kind = "race") {
  store.set(LOCAL_KEY[kind], []);
}
