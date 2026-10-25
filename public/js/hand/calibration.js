// 개인별 손가락 가동범위 보정 (캘리브레이션)
import {
  CAL_READY,
  CAL_OPEN,
  CAL_FINGER,
  DEFAULT_OPEN,
  DEFAULT_RANGE,
  MIN_RANGE,
  WEAK_RATIO,
  FINGER,
  FCOL,
} from "../config.js";
import { SFX } from "../audio.js";
import { trk, calib, setCalib } from "./tracker.js";
import { camOn, startCamera } from "./camera.js";

export let cal = null;
let uiCallbacks = {};

export function registerCalibUI(callbacks) {
  uiCallbacks = callbacks;
}

export async function startCalib(returnTo = "title") {
  if (!camOn) {
    if (uiCallbacks.showOverlay) {
      uiCallbacks.showOverlay(
        `<div class="panel"><p class="lead">손 맞추기는 카메라가 필요해요.</p><p>카메라를 켜는 중이에요.</p></div>`,
        "dim"
      );
    }
    const ok = await startCamera();
    if (!ok) {
      if (uiCallbacks.showOverlay) {
        uiCallbacks.showOverlay(
          `<div class="panel"><p class="lead">카메라를 켜지 못했어요.</p><p>카메라 권한 및 연결 상태를 확인해 주세요.</p><div class="btns"><button class="btn" data-act="title">메뉴로</button></div></div>`,
          "dim"
        );
      }
      return;
    }
  }

  if (uiCallbacks.setScreen) uiCallbacks.setScreen("calib");
  const steps = [{ kind: "open" }, ...[0, 1, 2, 3, 4].map((i) => ({ kind: "finger", i }))];
  cal = {
    steps,
    idx: 0,
    phase: "ready",
    t0: performance.now(),
    samples: { 1: [], 2: [] },
    res: {
      1: { open: null, closed: [null, null, null, null, null] },
      2: { open: null, closed: [null, null, null, null, null] },
    },
    returnTo,
  };
  renderCalStep();
}

export function renderCalStep() {
  if (!cal) return;
  const st = cal.steps[cal.idx];
  const head =
    st.kind === "open"
      ? `<div class="cal-finger">손을 활짝</div><p class="lead">두 사람 모두 손바닥을 카메라 쪽으로 보이고 손가락을 쫙 펴 주세요.</p>`
      : `<div class="cal-finger" style="color:${FCOL[st.i]}">${FINGER[st.i]}만</div><p class="lead">다른 손가락은 편 채로 ${FINGER[st.i]}만 끝까지 구부려 주세요. 덜 구부러져도 괜찮아요. 할 수 있는 만큼만요.</p>`;

  const live = [1, 2]
    .map(
      (p) =>
        `<div><span class="who" style="color:var(--p${p})">P${p}</span><span class="seen" id="calSeen${p}">손을 찾는 중</span>${
          st.kind === "finger"
            ? `<div class="bar"><div id="calBar${p}" style="background:${FCOL[st.i]}"></div></div>`
            : ""
        }</div>`
    )
    .join("");

  if (uiCallbacks.showOverlay) {
    uiCallbacks.showOverlay(
      `<div class="panel">
        <div class="eyebrow">손 맞추기 ${cal.idx + 1} / ${cal.steps.length}</div>
        ${head}
        <div class="cal-prog"><div id="calProg"></div></div>
        <p id="calPhase">준비하세요</p>
        <div class="cal-live">${live}</div>
        <div class="btns"><button class="btn" data-act="calcancel">그만하기</button></div>
      </div>`,
      "dim"
    );
  }
}

function pct(arr, q) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
}

export function calTick(now, currentScreen) {
  if (!cal || currentScreen !== "calib") return;
  const st = cal.steps[cal.idx];
  if (!st) return;
  const dur = st.kind === "open" ? CAL_OPEN : CAL_FINGER;
  const el = (id) => document.getElementById(id);

  for (const p of [1, 2]) {
    const seen = now - trk[p].seen < 150;
    const s = el(`calSeen${p}`);
    if (s) s.textContent = seen ? "손 인식 중" : "손이 안 보여요";
    const b = el(`calBar${p}`);
    if (b && st.kind === "finger" && trk[p].metric) {
      const i = st.i;
      const m = trk[p].metric[i];
      b.style.width = `${Math.round(
        Math.max(0, Math.min(1, (m - DEFAULT_OPEN[i]) / (DEFAULT_RANGE[i] * 1.2))) * 100
      )}%`;
    }
    if (cal.phase === "capture" && seen && trk[p].metric) {
      cal.samples[p].push(trk[p].metric.slice());
    }
  }

  const elapsed = now - cal.t0;
  const pProg = el("calProg");
  const pPhase = el("calPhase");

  if (cal.phase === "ready") {
    if (pProg) pProg.style.width = "0%";
    if (pPhase) pPhase.textContent = `${Math.ceil((CAL_READY - elapsed) / 1000)}초 뒤 측정해요`;
    if (elapsed >= CAL_READY) {
      cal.phase = "capture";
      cal.t0 = now;
      cal.samples = { 1: [], 2: [] };
      SFX.tick();
    }
  } else {
    if (pProg) pProg.style.width = `${Math.min(100, (elapsed / dur) * 100)}%`;
    if (pPhase) pPhase.textContent = "그대로 유지하세요";
    if (elapsed >= dur) {
      for (const p of [1, 2]) {
        const S = cal.samples[p];
        if (S.length < 5) continue;
        if (st.kind === "open") {
          cal.res[p].open = [0, 1, 2, 3, 4].map((i) => pct(S.map((m) => m[i]), 0.5));
        } else {
          cal.res[p].closed[st.i] = pct(S.map((m) => m[st.i]), 0.9);
        }
      }
      SFX.tick();
      cal.idx++;
      if (cal.idx >= cal.steps.length) {
        finishCalib();
      } else {
        cal.phase = "ready";
        cal.t0 = now;
        renderCalStep();
      }
    }
  }
}

function finishCalib() {
  if (uiCallbacks.setScreen) uiCallbacks.setScreen("calres");
  const report = {};
  const newCalib = { ...calib };

  for (const p of [1, 2]) {
    const r = cal.res[p];
    if (!r.open || r.closed.some((c) => c === null)) {
      report[p] = null;
      continue;
    }
    const closed = [], weak = [];
    for (let i = 0; i < 5; i++) {
      const range = r.closed[i] - r.open[i];
      weak[i] = range < DEFAULT_RANGE[i] * WEAK_RATIO;
      closed[i] = r.open[i] + Math.max(range, MIN_RANGE[i]);
    }
    newCalib[p] = { open: r.open, closed, weak };
    report[p] = newCalib[p];
  }

  setCalib(newCalib);
  if (uiCallbacks.syncCalStat) uiCallbacks.syncCalStat();
  SFX.clear();

  const col = (p) => {
    const c = report[p];
    if (!c) {
      return `<div><span class="who" style="color:var(--p${p})">P${p}</span><span class="tag miss">손이 충분히 안 보여서 이전 값을 그대로 써요.</span></div>`;
    }
    return (
      `<div><span class="who" style="color:var(--p${p})">P${p}</span>` +
      [0, 1, 2, 3, 4]
        .map((i) => {
          const ratio = Math.min(1, (c.closed[i] - c.open[i]) / DEFAULT_RANGE[i]);
          const tag = c.weak[i]
            ? '<span class="tag weak">범위 좁음 · 기준 낮춤</span>'
            : '<span class="tag">좋음</span>';
          return `<div class="r"><span>${FINGER[i]}</span><div class="bar"><div style="width:${Math.round(
            ratio * 100
          )}%;background:${FCOL[i]}"></div></div>${tag}</div>`;
        })
        .join("") +
      "</div>"
    );
  };

  if (uiCallbacks.showOverlay) {
    uiCallbacks.showOverlay(
      `<div class="panel">
        <div class="eyebrow">손 맞추기 결과</div>
        <h2>준비 완료</h2>
        <p>막대는 각 손가락이 구부러지는 범위예요. 범위가 좁은 손가락은 조금만 구부려도 인식되도록 그 사람에게 맞춰 기준을 낮췄어요.</p>
        <div class="cal-res">${col(1)}${col(2)}</div>
        <div class="btns"><button class="btn" data-act="calib">다시 맞추기</button><button class="btn primary" data-act="calok">${
          cal.returnTo === "play" ? "게임으로 돌아가기" : "확인"
        }</button></div>
      </div>`,
      "dim"
    );
  }
}
