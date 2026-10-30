// 상단/하단 게임 정보 HUD, 손가락 게이지, 손 유실 감지 및 자동 성능 조절
import { FINGER, FCOL, COL_P1, COL_P2, P1_ROLE, P1_KEY, P2_KEY, FIST_MS, LOST_WARN_MS } from "../config.js";
import { on, amtOf, allOn } from "../input.js";
import { sens, trk } from "../hand/tracker.js";
import { camOn, handStat } from "../hand/camera.js";
import { store, PERF_KEY } from "../store.js";
import { dyn, Q, setQuality, resize } from "../3d/engine.js";
import { isDoorCh, isBridge, isBrick, doorNeeds, bridgeNeeds } from "../3d/world.js";
import { cellAt, raceTotal } from "../game/state.js";
import { doorIsOpen, strayFingers, fingerNames, p2Count, bridgeUp, getBridgeSec, brickLeft } from "../game/logic.js";
import { say, clearHint } from "./toast.js";

export const fmt = (ms) => {
  const t = Math.max(0, ms) / 1000, m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
};

export function buildRows(el, player) {
  const rows = [];
  for (let i = 0; i < 5; i++) {
    const row = document.createElement("div");
    row.className = "frow";
    row.style.setProperty("--fc", FCOL[i]);
    const role =
      player === 1
        ? P1_ROLE[i]
        : `<i style="background:${FCOL[i]}"></i>${FINGER[i]} 철창`;
    row.innerHTML =
      `<span class="fname">${FINGER[i]}</span><span class="role">${role}</span>` +
      `<div class="fbar"><div class="fill"></div><div class="tick"></div></div>` +
      `<span class="key">${player === 1 ? P1_KEY[i] : P2_KEY[i]}</span>`;
    el.appendChild(row);
    rows.push({
      row,
      fill: row.querySelector(".fill"),
      tick: row.querySelector(".tick"),
      name: row.querySelector(".fname"),
    });
  }
  return rows;
}

let lastHudT = 0;
let pipsKey = "";
let trapKey = "";
let needKey = "";
let lostKey = "";
let fistT = 0, fistArmed = false, fistSince = 0, fistOff = 0;

const ARROW = { "-1,0": "↑", "1,0": "↓", "0,-1": "←", "0,1": "→" };

export function setText(el, v) {
  v = String(v);
  if (el && el.textContent !== v) el.textContent = v;
}

export function updateHUD(now, dt, game, run, screen, rowsP1, rowsP2, hudElements, primaryActionFn) {
  fistCheck(now, dt, screen, primaryActionFn);

  const s = sens();
  [[rowsP1, 1], [rowsP2, 2]].forEach(([rows, p]) =>
    rows.forEach((r, i) => {
      const w = Math.round(amtOf(p, i) * 50) * 2, o = on(p, i);
      if (r.w !== w) {
        r.w = w;
        r.fill.style.width = w + "%";
      }
      if (r.o !== o) {
        r.o = o;
        r.row.classList.toggle("on", o);
      }
      if (r.s !== s) {
        r.s = s;
        r.tick.style.left = `${s * 100}%`;
      }
    })
  );

  if (now - lastHudT < 66) return;
  lastHudT = now;

  if (game) {
    sonarHud(now, game, hudElements);
    needHud(game, screen, hudElements, rowsP2);

    const t = game.startT === null ? 0 : (game.endT ?? now) - game.startT;
    const raceOn = run.race && (screen === "play" || screen === "clear" || screen === "intro");
    if (hudElements.sRaceBox && hudElements.sRaceBox.hidden === raceOn) {
      hudElements.sRaceBox.hidden = !raceOn;
    }
    if (raceOn && hudElements.sRaceEl) {
      setText(hudElements.sRaceEl, fmt(raceTotal() + (screen === "play" && !game.won ? t : 0)));
    }
    setText(hudElements.sTimeEl, fmt(t));
    setText(hudElements.sStepsEl, game.steps);
    setText(hudElements.sCaughtEl, game.caught);
    setText(hudElements.sPushEl, game.push);
    setText(hudElements.sFallEl, game.fall);
  }

  lostCheck(now, screen, hudElements);
  if (screen !== "play") clearHint();
}

function sonarHud(now, game, hudElements) {
  const { pipsEl, sonarTxt, trapRow, trapTxt, trapPips } = hudElements;
  if (!pipsEl) return;

  const key = `${game.pings}/${game.pingMax}`;
  if (key !== pipsKey) {
    pipsKey = key;
    pipsEl.innerHTML = Array.from(
      { length: game.pingMax },
      (_, i) => `<span class="pip${i < game.pings ? " full" : ""}"></span>`
    ).join("");
  }

  let txt, ready = false;
  if (game.pings <= 0) txt = "모두 썼어요. 감으로 찾아요";
  else if (game.ping && now - game.ping.t0 < 7000) txt = game.ping.echoed ? "출구 신호를 잡았어요" : "탐지 중";
  else if (!camOn) txt = "P 키로 발사";
  else if (game.p2armed) {
    txt = "준비됨 · 둘 다 주먹을 쥐면 발사";
    ready = true;
  } else txt = "P1·P2 둘 다 주먹을 쥐면 발사";

  if (sonarTxt.textContent !== txt) sonarTxt.textContent = txt;
  sonarTxt.classList.toggle("ready", ready);

  const hasTrap = game.trapMax > 0;
  if (trapRow && trapRow.hidden !== !hasTrap) trapRow.hidden = trapTxt.hidden = !hasTrap;
  if (hasTrap && trapPips) {
    const tk = `${game.traps}/${game.trapMax}`;
    if (tk !== trapKey) {
      trapKey = tk;
      trapPips.innerHTML = Array.from(
        { length: game.trapMax },
        (_, i) => `<span class="pip${i < game.traps ? " full" : ""}"></span>`
      ).join("");
    }
    const tt =
      game.traps <= 0
        ? "덫을 모두 썼어요"
        : camOn
        ? "엄지·새끼만 펴면 가까운 괴물 묶기"
        : "T 키로 가까운 괴물 묶기";
    if (trapTxt.textContent !== tt) trapTxt.textContent = tt;
  }
}

function needHud(game, screen, hudElements, rowsP2) {
  const { needBox } = hudElements;
  if (!needBox) return;

  const items = [], want = new Set();
  let warn = "";

  if (screen === "play" && !game.won) {
    const here = cellAt(game.pos);
    if (isBridge(game, here)) {
      const n = bridgeNeeds(game, here);
      n.forEach((f) => want.add(f));
      items.push({ arrow: "지금", n, kind: `다리 ${getBridgeSec()}초 안에 건너기`, hold: true });
    }
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const ch = cellAt([game.pos[0] + dr, game.pos[1] + dc]);
      if (isDoorCh(game, ch)) {
        const n = doorNeeds(game, ch);
        n.forEach((f) => want.add(f));
        items.push({ arrow: ARROW[dr + "," + dc], n, kind: "철창" });
        const st = strayFingers(n);
        if (n.every((f) => on(2, f)) && st.length) warn = `${fingerNames(st)} 펴기`;
      } else if (isBrick(game, ch) && brickLeft(game, ch) > 0) {
        const f = game.s.bricks[ch].finger;
        want.add(f);
        items.push({ arrow: ARROW[dr + "," + dc], n: [f], kind: `벽돌 ${brickLeft(game, ch)}번 접기` });
      } else if (isBridge(game, ch)) {
        const n = bridgeNeeds(game, ch);
        n.forEach((f) => want.add(f));
        items.push({ arrow: ARROW[dr + "," + dc], n, kind: "다리" });
      }
    }
    if (p2Count() > 2 && items.some((x) => x.kind !== "철창")) {
      warn = "손가락 3개 이상 → 다리 안 생김";
    }
  }

  const key = JSON.stringify([items, warn]);
  if (key !== needKey) {
    needKey = key;
    needBox.innerHTML = items.length
      ? `<span class="nlbl">지금 구부릴 것</span>` +
        items
          .map((x) =>
            x.n
              .map(
                (f) =>
                  `<span class="nchip${x.hold ? " hold" : ""}" style="--c:${FCOL[f]}">${x.arrow} ${
                    FINGER[f]
                  }<small>${x.kind}</small></span>`
              )
              .join("")
          )
          .join("") +
        (warn ? `<span class="nwarn">${warn}</span>` : "")
      : `<span class="nlbl">근처에 철창·다리가 없어요</span>`;
  }
  rowsP2.forEach(({ row }, i) => row.classList.toggle("want", want.has(i)));
}

function lostCheck(now, screen, hudElements) {
  const { lostWarn, lostTitle, camBox } = hudElements;
  if (!lostWarn || !lostTitle) return;

  let key = "";
  if (camOn && screen === "play") {
    const m1 = now - trk[1].seen > LOST_WARN_MS, m2 = now - trk[2].seen > LOST_WARN_MS;
    key = m1 && m2 ? "both" : m1 ? "p1" : m2 ? "p2" : "";
  }
  if (key === lostKey) return;
  lostKey = key;
  lostWarn.hidden = !key;
  if (camBox) camBox.classList.toggle("lostcam", !!key);
  if (key) {
    lostTitle.textContent =
      key === "both"
        ? "두 사람 손이 안 보여요"
        : key === "p1"
        ? "P1 손이 안 보여요"
        : "P2 손이 안 보여요";
    lostWarn.style.setProperty("--lc", key === "p1" ? COL_P1 : key === "p2" ? COL_P2 : "#ff6a5a");
  }
}

function fistCheck(now, dt, screen, primaryActionFn) {
  if ((screen === "intro" || screen === "clear") && camOn) {
    const both = allOn(1) && allOn(2);
    if (!both) {
      fistOff ||= now;
      if (now - fistOff >= 250) fistArmed = true; // 0.25초 이상 확실히 폈을 때만 다시 준비
    } else fistOff = 0;
    // 실제 흐른 시간으로 재요 (화면이 느린 노트북에서도 1초면 넘어가게)
    if (both && fistArmed) { fistSince ||= now; fistT = now - fistSince; }
    else { fistSince = 0; fistT = 0; }
    const bar = document.querySelector("#fistBar");
    const wv = `${Math.round(Math.min(100, (fistT / FIST_MS) * 100))}%`;
    if (bar && bar.style.width !== wv) bar.style.width = wv;
    if (fistT >= FIST_MS) {
      fistT = 0;
      fistSince = 0;
      fistArmed = false;
      if (primaryActionFn) primaryActionFn();
    }
  }
}

// 성능 표시 및 자동 그래픽 최적화 모니터
export const pm = { frames: 0, since: performance.now(), on: store.get(PERF_KEY, false) };

export function togglePerf(perfEl, perfBtn) {
  pm.on = !pm.on;
  if (perfEl) perfEl.hidden = !pm.on;
  store.set(PERF_KEY, pm.on);
  if (perfBtn) {
    perfBtn.textContent = pm.on ? "켜짐 (F)" : "꺼짐 (F)";
    perfBtn.setAttribute("aria-pressed", String(pm.on));
  }
}

export function perfMeter(now, perfEl) {
  pm.frames++;
  if (now - pm.since < 500) return;
  const sec = (now - pm.since) / 1000;
  const fps = Math.round(pm.frames / sec);
  handStat.hz = Math.round(handStat.n / sec);
  pm.frames = 0;
  handStat.n = 0;
  pm.since = now;

  if (!pm.on || !perfEl) return;
  const hand = camOn
    ? `손 인식 ${handStat.hz}회/초 · ${handStat.ms.toFixed(0)}ms · ${handStat.mode} ${handStat.delegate}`
    : "손 인식 꺼짐";
  setText(
    perfEl,
    `화면 ${fps}fps · ${hand} · 그래픽 ${Q === "high" ? "높음" : "낮음"} · 해상도 ${Math.round(
      dyn.scale * 100
    )}%`
  );
}

const perfState = { acc: 0, n: 0, since: 0, done: false, low: 0, high: 0, lastChange: 0 };

export function perfCheck(now, dt, screen) {
  if (screen !== "play") {
    perfState.acc = perfState.n = 0;
    perfState.since = now;
    perfState.low = perfState.high = 0;
    return;
  }
  perfState.acc += dt;
  perfState.n++;
  if (now - perfState.since < 1000) return;

  const fps = 1000 / (perfState.acc / perfState.n);
  perfState.acc = perfState.n = 0;
  perfState.since = now;
  perfState.low = fps < 45 ? perfState.low + 1 : 0;
  perfState.high = fps >= 58 ? perfState.high + 1 : 0;

  if (now - perfState.lastChange < 3000) return;

  if (perfState.low >= 2 && dyn.scale > 0.56) {
    dyn.scale = Math.max(0.55, dyn.scale - 0.15);
    resize();
    perfState.lastChange = now;
    perfState.low = 0;
  } else if (perfState.high >= 6 && dyn.scale < 1) {
    dyn.scale = Math.min(1, dyn.scale + 0.1);
    resize();
    perfState.lastChange = now;
    perfState.high = 0;
  } else if (fps < 30 && dyn.scale <= 0.56 && Q === "high" && !perfState.done) {
    setQuality("low");
    dyn.scale = 1;
    perfState.done = true;
    say("화면이 버벅여서 그래픽 품질을 '낮음'으로 바꿨어요. 설정에서 되돌릴 수 있어요.", 4200);
  }
}
