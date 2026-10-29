// 열 손가락 미로 메인 진입점
import { FINGER } from "./config.js";
import { initGL, composer, renderer, scene, cam, Q, setQuality, applyQuality } from "./3d/engine.js";
import { world } from "./3d/world.js";
import { camCtl, measureHud } from "./3d/camera.js";
import { sync3D } from "./3d/sync.js";
import { store, SENS_KEY, CAM_MINI_KEY } from "./store.js";
import { audioUnlock, isMuted, toggleMute } from "./audio.js";
import { initKeyboardListeners, registerAction } from "./input.js";
import { trk, sens, setSens, getSensPercent, calib, settle } from "./hand/tracker.js";
import {
  initCameraDOM,
  startCamera,
  detect,
  camOn,
  isHandFresh,
  clearHandFresh,
} from "./hand/camera.js";
import { initOverlay, drawOverlay } from "./hand/overlay.js";
import { registerCalibUI, calTick, startCalib } from "./hand/calibration.js";
import { game, run, screen, stageIdx, exitCell, setScreen } from "./game/state.js";
import { doorIsOpen, bridgeLife, updateGame, firePing, fireTrap } from "./game/logic.js";
import { drawRps } from "./ui/rps.js";
import { initRadarCanvas, drawRadar, radar } from "./ui/radar.js";
import { initToastDOM, updateToast, say } from "./ui/toast.js";
import {
  buildRows,
  updateHUD,
  togglePerf,
  perfMeter,
  perfCheck,
  pm,
} from "./ui/hud.js";
import {
  initScreensDOM,
  showOverlay,
  toggleSettings,
  goTitle,
  startStage,
  showClear,
  saveRace,
  primaryAction,
  setStageLabel,
} from "./ui/screens.js";
import { initFirebase } from "./firebase/init.js";

// DOM 요소 쿼리
const glCanvas = document.getElementById("gl");
const dangerEl = document.getElementById("danger");
const flashEl = document.getElementById("flash");
const ov = document.getElementById("ov");
const stageLabelEl = document.getElementById("stageLabel");
const perfEl = document.getElementById("perfInfo");
const setBtn = document.getElementById("setBtn");
const homeBtn = document.getElementById("homeBtn");
const resetBtn = document.getElementById("resetBtn");
const msgEl = document.getElementById("msg");
const hintEl = document.getElementById("hint");
const lostWarn = document.getElementById("lostWarn");
const lostTitle = document.getElementById("lostTitle");
const settingsEl = document.getElementById("settings");
const calStat = document.getElementById("calStat");
const calBtn = document.getElementById("calBtn");
const sensSlider = document.getElementById("sensSlider");
const sensOut = document.getElementById("sensOut");
const qHigh = document.getElementById("qHigh");
const qLow = document.getElementById("qLow");
const muteBtn = document.getElementById("muteBtn");
const perfBtn = document.getElementById("perfBtn");
const rowsP1El = document.getElementById("rowsP1");
const rowsP2El = document.getElementById("rowsP2");
const camBox = document.getElementById("camBox");
const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const camFold = document.getElementById("camFold");
const camEmpty = document.getElementById("camEmpty");
const camText = document.getElementById("camText");
const camBtn = document.getElementById("camBtn");
const radarCv = document.getElementById("radar");
const pipsEl = document.getElementById("pips");
const sonarTxt = document.getElementById("sonarTxt");
const trapRow = document.getElementById("trapRow");
const trapTxt = document.getElementById("trapTxt");
const trapPips = document.getElementById("trapPips");
const needBox = document.getElementById("needBox");
const bootEl = document.getElementById("boot");
const bootMsg = document.getElementById("bootMsg");

const sTimeEl = document.getElementById("sTime");
const sStepsEl = document.getElementById("sSteps");
const sCaughtEl = document.getElementById("sCaught");
const sPushEl = document.getElementById("sPush");
const sFallEl = document.getElementById("sFall");
const sRaceBox = document.getElementById("sRaceBox");
const sRaceEl = document.getElementById("sRace");

// 서브시스템 초기화
initToastDOM({ msgEl, hintEl });
initRadarCanvas(radarCv);
initOverlay(overlay, video);
initCameraDOM({ video, camBtn, camText, camEmpty });
initScreensDOM({ ov, stageLabelEl, settingsEl, setBtn, camBox });

const rowsP1 = buildRows(rowsP1El, 1);
const rowsP2 = buildRows(rowsP2El, 2);

function syncCalStat() {
  const n = [1, 2].filter((p) => calib[p]).length;
  const weak = [1, 2]
    .flatMap((p) =>
      calib[p] ? calib[p].weak.map((w, i) => (w ? `P${p} ${FINGER[i]}` : null)) : []
    )
    .filter(Boolean);
  if (calStat) {
    calStat.innerHTML =
      n === 0
        ? "손 보정 전 · 기본값 사용 중"
        : `<b>보정 완료</b>&nbsp;${n === 2 ? "P1·P2" : calib[1] ? "P1만" : "P2만"}${
            weak.length ? ` · 약한 손가락 ${weak.join(", ")}` : ""
          }`;
  }
  [[rowsP1, 1], [rowsP2, 2]].forEach(([rows, p]) =>
    rows.forEach(({ name }, i) => {
      name.innerHTML =
        FINGER[i] +
        (calib[p]?.weak[i] ? '<span class="weak" title="범위가 좁아 기준을 낮췄어요">●</span>' : "");
    })
  );
}

registerCalibUI({
  showOverlay,
  syncCalStat,
  setScreen, // 빠져 있어서 손 맞추기 화면 상태가 바뀌지 않아 측정이 시작되지 않던 문제 수정
});

// 민감도 슬라이더 동기화
sensSlider.value = getSensPercent();
function syncSens() {
  sensOut.textContent = `${sensSlider.value}%`;
  setSens(sensSlider.value);
}
sensSlider.addEventListener("input", syncSens);
syncSens();
syncCalStat();

// 카메라 접기 제어
function setCamMini(v) {
  camBox.classList.toggle("mini", v);
  camFold.textContent = v ? "카메라 펴기 C" : "접기 C";
  store.set(CAM_MINI_KEY, v);
  setTimeout(() => measureHud(camBox), 30);
}
camFold.addEventListener("click", () => setCamMini(!camBox.classList.contains("mini")));
setCamMini(store.get(CAM_MINI_KEY, false));

// 소리 제어
function syncMuteUI() {
  const muted = isMuted();
  muteBtn.textContent = muted ? "꺼짐 (M)" : "켜짐 (M)";
  muteBtn.setAttribute("aria-pressed", String(muted));
}
muteBtn.addEventListener("click", () => {
  toggleMute();
  syncMuteUI();
});
syncMuteUI();

// 그래픽 품질 제어
qHigh.addEventListener("click", () => {
  setQuality("high");
  syncQualityUI();
});
qLow.addEventListener("click", () => {
  setQuality("low");
  syncQualityUI();
});
function syncQualityUI() {
  qHigh.setAttribute("aria-pressed", String(Q === "high"));
  qLow.setAttribute("aria-pressed", String(Q !== "high"));
}
syncQualityUI();

// 성능창 토글
perfBtn.addEventListener("click", () => togglePerf(perfEl, perfBtn));
if (pm.on) togglePerf(perfEl, perfBtn); // 초기 상태 반영

// 이벤트 리스너 연결
window.addEventListener("pointerdown", audioUnlock);
window.addEventListener("keydown", audioUnlock);

camBtn.addEventListener("click", () => {
  startCamera().then((ok) => {
    if (ok) say("카메라 준비 완료. 처음이라면 설정에서 '손 맞추기'를 먼저 해 보세요.");
  });
});

calBtn.addEventListener("click", () => {
  toggleSettings(false);
  startCalib(screen === "play" ? "play" : "title");
});

setBtn.addEventListener("click", () => toggleSettings());
homeBtn.addEventListener("click", goTitle);
resetBtn.addEventListener("click", () => {
  if (screen === "play" || screen === "clear") startStage(stageIdx, true);
});

// 키보드 액션 핸들러 바인딩
registerAction("primary", primaryAction);
registerAction("escape", () => {
  if (!settingsEl.hidden) toggleSettings(false);
  else goTitle();
});
registerAction("restart", () => {
  if (screen === "play" || screen === "clear") startStage(stageIdx, true);
});
registerAction("mute", () => {
  toggleMute();
  syncMuteUI();
});
registerAction("perf", () => togglePerf(perfEl, perfBtn));
registerAction("camToggle", () => setCamMini(!camBox.classList.contains("mini")));
registerAction("ping", () => {
  if (screen === "play") firePing(game, performance.now(), world, document.getElementById("sonarBox"));
});
registerAction("trap", () => {
  if (screen === "play") fireTrap(game, performance.now(), world);
});
registerAction("saveRace", saveRace);
initKeyboardListeners();

// 메인 루프
let lastT = performance.now();
let frameNo = 0;
let lastRadarT = 0;
const FRAME_MS = 1000 / 61;

const hudElements = {
  pipsEl,
  sonarTxt,
  trapRow,
  trapTxt,
  trapPips,
  needBox,
  lostWarn,
  lostTitle,
  camBox,
  sTimeEl,
  sStepsEl,
  sCaughtEl,
  sPushEl,
  sFallEl,
  sRaceBox,
  sRaceEl,
};

function loop() {
  requestAnimationFrame(loop);
  const t = performance.now();
  if (t - lastT < FRAME_MS - 1) return;
  const now = t, dt = Math.min(50, now - lastT);
  lastT = now;
  frameNo++;

  if (renderer.shadowMap.enabled && frameNo % 2 === 0) {
    renderer.shadowMap.needsUpdate = true;
  }

  detect(now);
  settle(trk[1], now);
  settle(trk[2], now);

  calTick(now, screen);
  updateGame(game, now, screen, world, flashEl, showClear);

  sync3D(
    now,
    dt,
    world,
    game,
    screen,
    glCanvas,
    dangerEl,
    (ch) => doorIsOpen(game, ch),
    (ch) => bridgeLife(game, ch, now),
    exitCell,
    radar.blips
  );

  if (Q === "high") composer.render();
  else if (frameNo % 2 === 0) renderer.render(scene, cam); // 낮음: 화면은 30fps, 손 인식에 그래픽 성능 양보

  if (isHandFresh()) {
    drawOverlay();
    clearHandFresh();
  }

  if (now - lastRadarT >= 33) {
    lastRadarT = now;
    drawRadar(now, game, screen, exitCell);
  }

  updateHUD(now, dt, game, run, screen, rowsP1, rowsP2, hudElements, primaryAction);
  drawRps(now, game, screen);
  perfMeter(now, perfEl);
  perfCheck(now, dt, screen);
  updateToast(now);
}

// 부팅 시퀀스
(async function boot() {
  try {
    await Promise.race([
      document.fonts.load('900 72px "Noto Sans KR"'),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
    await initGL(glCanvas);
  } catch (e) {
    console.error("3D 엔진 초기화 실패:", e);
    if (bootMsg) {
      bootMsg.textContent = "3D 엔진을 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.";
    }
    return;
  }

  // Firebase 백그라운드 비동기 초기화
  initFirebase().catch((err) => console.warn("Firebase 연결 실패:", err));

  applyQuality();
  goTitle();
  camCtl.pos = null;
  bootEl.hidden = true;
  requestAnimationFrame(loop);
})();
