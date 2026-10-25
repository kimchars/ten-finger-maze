// 웹캠 스트림 및 MediaPipe 손 인식 파이프라인
import { MP_URL, MP_WASM, MP_MODEL, MP_CJS, HAND_HZ, ROLE_MEMORY_MS } from "../config.js";
import { feed, setAspect } from "./tracker.js";

export const handStat = { mode: "", delegate: "", ms: 0, hz: 0, n: 0 };
export let camOn = false;
export let handsNow = { a: null, b: null };
export let handFresh = false;

let video = null;
let camBtn = null;
let camText = null;
let camEmpty = null;
let landmarker = null;
let camStarting = null;
let lastVideoTime = -1;
let worker = null;
let inFlight = false;
let sentAt = 0;
let lastSend = 0;

export const roleTrack = {
  1: { x: 0.25, y: 0.5, t: -1e9 },
  2: { x: 0.75, y: 0.5, t: -1e9 }
};

export function initCameraDOM(elements) {
  video = elements.video;
  camBtn = elements.camBtn;
  camText = elements.camText;
  camEmpty = elements.camEmpty;
}

export function isCamOn() {
  return camOn;
}

export function getHandsNow() {
  return handsNow;
}

export function isHandFresh() {
  return handFresh;
}

export function clearHandFresh() {
  handFresh = false;
}

export function startCamera() {
  if (camOn) return Promise.resolve(true);
  if (!camStarting) {
    camStarting = doStartCamera().finally(() => {
      camStarting = null;
    });
  }
  return camStarting;
}

async function doStartCamera() {
  if (camBtn) camBtn.disabled = true;
  if (!navigator.mediaDevices?.getUserMedia) {
    if (camText) camText.textContent = "여기서는 카메라를 쓸 수 없어요. HTTPS 또는 localhost로 열어 주세요.";
    if (camBtn) camBtn.disabled = false;
    return false;
  }
  try {
    if (camText) camText.textContent = "카메라 권한을 요청하는 중이에요.";
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    setAspect((video.videoWidth || 640) / (video.videoHeight || 480));
  } catch (e) {
    if (camText) {
      camText.textContent = e?.name === "NotAllowedError"
        ? "카메라 권한이 거부됐어요. 주소창 왼쪽 아이콘에서 허용해 주세요."
        : "카메라를 켜지 못했어요. 다른 앱이 쓰고 있는지 확인해 주세요.";
    }
    if (camBtn) camBtn.disabled = false;
    return false;
  }

  try {
    if (camText) camText.textContent = "손 인식 모델을 받는 중이에요.";
    if (!(await initWorker())) {
      await initMainThread();
    }
    camOn = true;
    if (camEmpty) camEmpty.hidden = true;
    return true;
  } catch (e) {
    console.error("손 인식 초기화 실패:", e);
    if (camText) camText.textContent = "손 인식 모델을 받지 못했어요. 인터넷 연결을 확인해 주세요.";
    if (camBtn) camBtn.disabled = false;
    return false;
  }
}

function initWorker() {
  return new Promise((resolve) => {
    let w;
    try {
      // 별도 워커 파일 로드 (모듈 워커 또는 표준 워커)
      w = new Worker(new URL("../../workers/hand-worker.js", import.meta.url));
    } catch (e) {
      console.warn("작업자를 만들 수 없음", e);
      resolve(false);
      return;
    }

    let timer = 0;
    const fail = (why) => {
      clearTimeout(timer);
      console.warn("백그라운드 손 인식 실패, 기본 방식으로 전환:", why);
      w.terminate();
      resolve(false);
    };

    timer = setTimeout(() => fail("시간 초과"), 40000);
    w.onerror = (e) => fail(e.message || e);
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === "ready") {
        clearTimeout(timer);
        worker = w;
        handStat.mode = "백그라운드";
        handStat.delegate = d.delegate;

        w.onmessage = (ev) => {
          if (ev.data.type !== "result") return;
          inFlight = false;
          applyHands(ev.data.landmarks || [], performance.now());
          noteHand(ev.data.ms);
          if (camOn && video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            sendFrame(performance.now());
          }
        };
        resolve(true);
      } else if (d.type === "error") {
        fail(d.message);
      }
    };

    w.postMessage({ type: "init", cjs: MP_CJS, wasm: MP_WASM, model: MP_MODEL });
  });
}

async function initMainThread() {
  const { FilesetResolver, HandLandmarker } = await import(MP_URL);
  const files = await FilesetResolver.forVisionTasks(MP_WASM);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: MP_MODEL, delegate },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  handStat.mode = "기본";
  handStat.delegate = "GPU";
  try {
    landmarker = await HandLandmarker.createFromOptions(files, opts("GPU"));
  } catch {
    landmarker = await HandLandmarker.createFromOptions(files, opts("CPU"));
    handStat.delegate = "CPU";
  }
}

function noteHand(ms) {
  handStat.ms = handStat.ms ? handStat.ms * 0.8 + ms * 0.2 : ms;
  handStat.n++;
  handFresh = true;
}

function sendFrame(now) {
  if (!video) return;
  lastVideoTime = video.currentTime;
  lastSend = sentAt = now;
  inFlight = true;
  createImageBitmap(video)
    .then((bmp) => worker.postMessage({ type: "frame", bitmap: bmp, ts: now }, [bmp]))
    .catch(() => {
      inFlight = false;
    });
}

export function detect(now) {
  if (!camOn || !video || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  if (worker) {
    if (inFlight && now - sentAt < 1000) return;
    sendFrame(now);
    return;
  }
  if (now - lastSend < 1000 / HAND_HZ - 2) return;
  lastVideoTime = video.currentTime;
  lastSend = now;
  const t0 = performance.now();
  let res;
  try {
    res = landmarker.detectForVideo(video, now);
  } catch {
    return;
  }
  applyHands(res.landmarks || [], now);
  noteHand(performance.now() - t0);
}

export function applyHands(list, now) {
  const hands = list.slice(0, 2).map((lm) => {
    let x = 0, y = 0;
    for (const i of [0, 5, 9, 13, 17]) {
      x += lm[i].x;
      y += lm[i].y;
    }
    return { lm, mx: 1 - x / 5, my: y / 5 };
  });

  const recent = (p) => now - roleTrack[p].t < ROLE_MEMORY_MS;
  const gap = (h, p) => Math.hypot(h.mx - roleTrack[p].x, (h.my - roleTrack[p].y) * 0.75);

  let a = null, b = null;
  if (hands.length === 2) {
    const [h1, h2] = hands;
    if (gap(h1, 1) + gap(h2, 2) <= gap(h1, 2) + gap(h2, 1)) {
      a = h1; b = h2;
    } else {
      a = h2; b = h1;
    }
  } else if (hands.length === 1) {
    const h = hands[0], r1 = recent(1), r2 = recent(2);
    if (r1 && !r2 && gap(h, 1) < 0.3) a = h;
    else if (r2 && !r1 && gap(h, 2) < 0.3) b = h;
    else if (gap(h, 1) <= gap(h, 2)) a = h;
    else b = h;
  }

  if (a) {
    feed(1, a.lm, now);
    roleTrack[1] = { x: a.mx, y: a.my, t: now };
  }
  if (b) {
    feed(2, b.lm, now);
    roleTrack[2] = { x: b.mx, y: b.my, t: now };
  }
  handsNow = { a, b };
}
