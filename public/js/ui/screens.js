// 메뉴, 인트로, 클리어, 최종 결과 및 순위표 오버레이 화면 관리
import { STAGES } from "../game/stages.js";
import { store, BEST_KEY, LAST_NAME_KEY, SHOTS_KEY } from "../store.js";
import { renderer, scene, cam } from "../3d/engine.js";
import { getBridgeSec } from "../game/logic.js";
import { SFX } from "../audio.js";
import { camOn } from "../hand/camera.js";
import { startCalib, cal } from "../hand/calibration.js";
import { fmt, setText } from "./hud.js";
import { newRun, run, setRun, stageIdx, setStageIdx, screen, setScreen, game, raceTotal, raceDeaths, loadStage } from "../game/state.js";
import { buildWorld, world } from "../3d/world.js";
import { measureHud } from "../3d/camera.js";
import { say } from "./toast.js";
import { fetchLeaderboard, submitScore, clearLocalLeaderboard } from "../firebase/leaderboard.js";

let ov = null;
let stageLabelEl = null;
let settingsEl = null;
let setBtn = null;
let camBox = null;
let best = store.get(BEST_KEY, {});

export function initScreensDOM(elements) {
  ov = elements.ov;
  stageLabelEl = elements.stageLabelEl;
  settingsEl = elements.settingsEl;
  setBtn = elements.setBtn;
  camBox = elements.camBox;

  ov.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "start") {
      setRun(newRun(true));
      showIntro(0);
    } else if (act === "trial") {
      startTrial();
    } else if (act === "saveshot") {
      saveRace(true);
    } else if (act === "shot") {
      showShot(b.dataset.id, b.dataset.kind);
    } else if (act === "stage") {
      setRun(newRun(false));
      showIntro(Number(b.dataset.i));
    } else if (act === "board") {
      showBoard(null, b.dataset.kind || "trial");
    } else if (act === "saverace") {
      saveRace();
    } else if (act === "clearboard") {
      clearBoard(b, b.dataset.kind || "race");
    } else if (act === "go") {
      startStage(stageIdx);
    } else if (act === "next") {
      nextStage();
    } else if (act === "retry") {
      startStage(stageIdx, true);
    } else if (act === "title") {
      goTitle();
    } else if (act === "settings") {
      toggleSettings(true);
    } else if (act === "calib") {
      startCalib(cal?.returnTo || "title");
    } else if (act === "calcancel" || act === "calok") {
      const r = cal?.returnTo;
      if (r === "play" && game && !game.won) {
        // 손 맞추기 하는 동안 흐른 시간은 기록에 넣지 않아요
        if (game.startT !== null && cal?.startedAt) game.startT += performance.now() - cal.startedAt;
        setScreen("play");
        hideOverlay();
      } else {
        goTitle();
      }
    }
  });
}

export function showOverlay(html, mode = "") {
  if (!ov) return;
  document.body.classList.toggle("menu-on", mode === "menu");
  ov.className = "ov" + (mode ? " " + mode : "");
  ov.innerHTML = html;
  ov.hidden = false;
}

export function hideOverlay() {
  if (!ov) return;
  ov.hidden = true;
  ov.innerHTML = "";
  document.body.classList.remove("menu-on");
}

export function toggleSettings(v = settingsEl ? settingsEl.hidden : false) {
  if (!settingsEl || !setBtn) return;
  settingsEl.hidden = !v;
  setBtn.setAttribute("aria-expanded", String(v));
}

const fistHint = () =>
  `<div class="fist"><span>${
    camOn ? "두 사람 모두 주먹을 1초 쥐면 다음으로 (또는 Enter)" : "Enter"
  }</span>${camOn ? '<div class="track"><div id="fistBar"></div></div>' : ""}</div>`;

const escapeHtml = (t) =>
  String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 스테이지 설명 안의 {초}를 지금 설정한 다리 시간으로 바꿔요
const tipT = (t) => String(t).replaceAll("{초}", getBridgeSec());

// 체험 모드: 1~3단계만 하고 기록을 저장해요 (부스 체험용)
export const TRIAL_LAST = 2;
const runLast = () => (run.trial ? TRIAL_LAST : STAGES.length - 1);
const runKind = () => (run.trial ? "trial" : "race");

export function startTrial() {
  setRun({ ...newRun(false), trial: true });
  showIntro(0);
}

// ── 화면 캡처 (기록 옆에 보여줄 사진) ──
// 사진은 이 브라우저에만 저장돼요. 온라인 순위표에는 이름과 기록만 올라가요.
function grabGame() {
  try {
    renderer.render(scene, cam);
    const src = renderer.domElement;
    const w = 640, h = Math.round((w * src.height) / Math.max(1, src.width));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(src, 0, 0, w, h);
    return c;
  } catch {
    return null;
  }
}
// 웹캠 한 장 찍기 (거울처럼 좌우 반전 — 화면에서 보던 모습 그대로)
function grabCam() {
  const v = document.getElementById("video");
  if (!camOn || !v || v.readyState < 2 || !v.videoWidth) return null;
  const w = 640, h = Math.round((w * v.videoHeight) / v.videoWidth);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.translate(w, 0);
  g.scale(-1, 1);
  g.drawImage(v, 0, 0, w, h);
  return c;
}

// 3, 2, 1 카운트다운 뒤 웹캠으로 기념사진을 찍어요 (카메라가 없으면 null)
function countdownPhoto() {
  return new Promise((resolve) => {
    const v = document.getElementById("video");
    if (!camOn || !v || v.readyState < 2) return resolve(null);
    showOverlay(
      `<div class="panel">
        <div class="eyebrow">기념사진</div>
        <h2>카메라를 보세요!</h2>
        <div class="photobox"><canvas id="photoLive"></canvas><div class="photocount" id="photoCount">3</div></div>
        <p class="small">탈출 장면과 함께 기록 옆에 남아요. 이 노트북에만 저장돼요.</p>
      </div>`,
      "dim"
    );
    const cv = document.getElementById("photoLive"), cnt = document.getElementById("photoCount");
    const t0 = performance.now(), DUR = 3000;
    const tick = () => {
      const left = DUR - (performance.now() - t0);
      const frame = grabCam();
      if (frame && cv) {
        cv.width = frame.width;
        cv.height = frame.height;
        cv.getContext("2d").drawImage(frame, 0, 0);
      }
      if (left > 0) {
        if (cnt) cnt.textContent = String(Math.ceil(left / 1000));
        requestAnimationFrame(tick);
        return;
      }
      SFX.tick();
      if (cnt) cnt.textContent = "찰칵!";
      document.querySelector(".photobox")?.classList.add("flash");
      setTimeout(() => resolve(frame), 450);
    };
    SFX.tick();
    tick();
  });
}

function composeShot(raw, name, timeMs, camShot) {
  const main = camShot || raw;
  if (!main) return null;
  const bar = 64, c = document.createElement("canvas");
  c.width = main.width;
  c.height = main.height + bar;
  const g = c.getContext("2d");
  g.fillStyle = "#0b0d14";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(main, 0, 0);
  // 웹캠 사진이면 오른쪽 위에 탈출 장면을 작게 넣어요
  if (camShot && raw) {
    const iw = Math.round(c.width * 0.32), ih = Math.round((iw * raw.height) / raw.width), m = 14;
    g.fillStyle = "rgba(0,0,0,0.6)";
    g.fillRect(c.width - iw - m - 3, m - 3, iw + 6, ih + 6);
    g.drawImage(raw, c.width - iw - m, m, iw, ih);
    g.strokeStyle = "#ffae5c";
    g.lineWidth = 2;
    g.strokeRect(c.width - iw - m, m, iw, ih);
  }
  g.fillStyle = "#ffae5c";
  g.font = '900 26px "Noto Sans KR", sans-serif';
  g.textBaseline = "middle";
  g.fillText(name, 18, main.height + bar / 2);
  g.textAlign = "right";
  g.fillStyle = "#ffffff";
  g.fillText(fmt(timeMs), c.width - 18, main.height + bar / 2 - 8);
  g.font = '500 14px "Noto Sans KR", sans-serif';
  g.fillStyle = "#b8b0a0";
  g.fillText(`열 손가락 미로 · ${run.trial ? "1~3단계 체험" : "5단계 레이스"} · ${new Date().toLocaleDateString("ko-KR")}`, c.width - 18, main.height + bar / 2 + 17);
  return c.toDataURL("image/jpeg", 0.8);
}
const loadShots = () => {
  const s = store.get(SHOTS_KEY, {});
  return s && typeof s === "object" ? s : {};
};
function saveShot(id, url) {
  const s = loadShots();
  s[id] = { url, at: Date.now() };
  // 오래된 사진부터 지워서 30장까지만 보관 (브라우저 저장 공간 보호)
  const keys = Object.keys(s).sort((a, b) => s[b].at - s[a].at);
  keys.slice(30).forEach((k) => delete s[k]);
  try {
    store.set(SHOTS_KEY, s);
  } catch {}
}

export function showShot(id, kind) {
  const s = loadShots()[id];
  if (!s) return;
  setScreen("board");
  showOverlay(
    `<div class="panel">
      <div class="eyebrow">기념 사진</div>
      <img class="shotbig" src="${s.url}" alt="기록 캡처">
      <div class="btns">
        <a class="btn" href="${s.url}" download="열손가락미로-기록.jpg">사진 내려받기</a>
        <button class="btn primary" data-act="board" data-kind="${kind}">순위표로</button>
      </div>
    </div>`,
    "dim"
  );
  document.body.classList.add("menu-on");
}

export function setStageLabel() {
  const s = STAGES[stageIdx];
  if (stageLabelEl) {
    stageLabelEl.innerHTML = `<b>${stageIdx + 1}. ${s.name}</b> · ${s.tag}`;
  }
}

export function goTitle() {
  if ((run.race || run.trial) && screen !== "final") setRun(newRun(false));
  setScreen("title");
  loadStage(4, false);
  buildWorld(game, 4);

  if (stageLabelEl) stageLabelEl.textContent = "P1은 길을 찾고, P2는 철창을 열어요.";

  const chips = STAGES.map(
    (s, i) =>
      `<button class="schip" data-act="stage" data-i="${i}"><b>${i + 1}. ${s.name}</b><span>${
        best[i] ? "최고 " + fmt(best[i]) : "기록 없음"
      }</span></button>`
  ).join("");

  showOverlay(
    `<div class="menucol">
      <div class="eyebrow">2인 협동 · 손가락 열 개</div>
      <h1>열 손가락<br>미로</h1>
      <p class="tag">한 사람은 랜턴을 든 탐험가를, 한 사람은 철창을 움직여요. 누구라도 손을 떼는 순간 철창이 닫히고, 어둠 속에서는 그림자 괴물이 기다려요.</p>
      <div class="menu-btns">
        <button class="mbtn" data-act="trial">체험 시작 · 1~3단계 <small>ENTER</small></button>
        <button class="mbtn" data-act="start">레이스 · 5단계 전체</button>
        <button class="mbtn" data-act="calib">손 맞추기</button>
        <button class="mbtn" data-act="board">온라인 순위표</button>
        <button class="mbtn" data-act="settings">설정</button>
      </div>
      <div class="stagegrid">${chips}</div>
    </div>`,
    "menu"
  );
}

export function showIntro(i) {
  setStageIdx(i);
  setScreen("intro");
  loadStage(i, false);
  buildWorld(game, i);
  const s = STAGES[i];
  setStageLabel();

  showOverlay(
    `<div class="panel">
      <div class="eyebrow">${s.tag} · ${i + 1} / ${run.trial ? TRIAL_LAST + 1 : STAGES.length}</div>
      <h2>${s.name}</h2>
      <p class="lead">${tipT(s.desc)}</p>
      <p>${tipT(s.tip)}</p>
      <p class="lead" style="color:var(--sonar)">소나 핑 ${s.pings}번 · P1·P2가 동시에 주먹을 쥐면 출구 쪽에서 신호가 돌아와요.</p>
      <div class="btns"><button class="btn primary big" data-act="go">시작</button></div>
      ${fistHint()}
    </div>`
  );
  SFX.tick();
}

export function startStage(i, restart = false) {
  setTimeout(() => measureHud(camBox), 60);
  if (restart && game && game.startT !== null && stageIdx === i) {
    run.extra += (game.endT ?? performance.now()) - game.startT;
    run.extraDeaths += game.caught + game.fall;
    run.results[i] = undefined;
  }
  setStageIdx(i);
  loadStage(i, true);
  buildWorld(game, i);
  setStageLabel();
  setScreen("play");
  hideOverlay();
  toggleSettings(false);
  SFX.start();
  say(restart ? "다시 시작해요." : tipT(STAGES[i].tip), 3400);
}

export function nextStage() {
  if (stageIdx < runLast()) {
    showIntro(stageIdx + 1);
  } else {
    showFinal();
  }
}

export function showClear() {
  setScreen("clear");
  const g = game, t = g.endT - g.startT, i = stageIdx;
  const rec = !best[i] || t < best[i];
  if (rec) {
    best[i] = t;
    store.set(BEST_KEY, best);
  }
  run.results[i] = {
    time: t,
    steps: g.steps,
    caught: g.caught,
    push: g.push,
    fall: g.fall,
    pings: g.pings,
    pingMax: g.pingMax,
  };
  const last = i >= runLast();
  SFX.stageClear(last);
  // 마지막 단계면 출구 장면을 잠깐 뒤에 찍어 둬요 (저장할 때 캡처를 고르면 이 사진을 써요)
  if (last) {
    run.shotRaw = null;
    setTimeout(() => {
      if (screen === "clear") run.shotRaw = grabGame();
    }, 1000);
  }
  setTimeout(() => {
    if (screen !== "clear") return;
    showOverlay(
      `<div class="panel">
        <div class="eyebrow">${i + 1}. ${STAGES[i].name}</div>
        <h2>탈출 성공</h2>
        ${rec ? '<span class="badge">최고 기록</span>' : `<p>최고 기록 ${fmt(best[i])}</p>`}
        <div class="kv">
          <div><span>시간</span><b>${fmt(t)}</b></div>
          <div><span>걸음</span><b>${g.steps}</b></div>
          <div><span>잡힘</span><b>${g.caught}</b></div>
          <div><span>밀려남</span><b>${g.push}</b></div>
          <div><span>빠짐</span><b>${g.fall}</b></div>
          <div><span>남은 핑</span><b>${g.pings}/${g.pingMax}</b></div>
        </div>
        <div class="btns">
          <button class="btn" data-act="retry">다시 하기</button>
          <button class="btn primary big" data-act="next">${last ? "최종 결과 보기" : "다음 스테이지"}</button>
        </div>
        ${fistHint()}
      </div>`
    );
  }, 1300);
}

export function showFinal() {
  setScreen("final");
  SFX.done();
  const count = runLast() + 1;
  const rows = STAGES.slice(0, count).map((s, i) => {
    const r = run.results[i];
    return `<tr>
      <td>${i + 1}. ${s.name}</td>
      <td>${r ? fmt(r.time) : "-"}</td>
      <td>${r ? r.steps : "-"}</td>
      <td>${r ? r.caught : "-"}</td>
      <td>${r ? r.push : "-"}</td>
      <td>${r ? r.fall ?? 0 : "-"}</td>
      <td>${r ? `${r.pings}/${r.pingMax}` : "-"}</td>
    </tr>`;
  }).join("");

  const done = run.results.slice(0, count).filter(Boolean);
  const total = done.reduce((a, r) => a + r.time, 0);
  const ranked = run.race || run.trial;
  const canSave = ranked && done.length === count && !run.saved;
  const label = run.trial ? "체험 기록" : "레이스 기록";

  showOverlay(
    `<div class="panel">
      <div class="eyebrow">${run.trial ? "체험 완료 · 1~3단계" : "최종 결과"}</div>
      <h2>${done.length === count ? (run.trial ? "광산 탈출 성공!" : "모든 미로 탈출") : `${done.length}개 미로 탈출`}</h2>
      <p class="lead">합계 ${fmt(total)} · 잡힘 ${done.reduce((a, r) => a + r.caught, 0)}번 · 빠짐 ${done.reduce(
        (a, r) => a + (r.fall || 0),
        0
      )}번 · 밀려남 ${done.reduce((a, r) => a + r.push, 0)}번</p>
      <div class="tblwrap">
        <table class="tbl">
          <thead>
            <tr><th>스테이지</th><th>시간</th><th>걸음</th><th>잡힘</th><th>밀려남</th><th>빠짐</th><th>남은 핑</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${
        canSave
          ? `<div class="racebox">
        <div class="racebig">
          <div><span>${label}</span><b>${fmt(raceTotal())}</b></div>
          <div><span>죽은 횟수</span><b>${raceDeaths()}</b></div>
        </div>
        ${run.extra > 0 ? `<p class="small">다시 하기로 버린 시도 ${fmt(run.extra)} 포함</p>` : ""}
        <label class="namefield" for="raceName">팀 이름
          <input id="raceName" maxlength="12" autocomplete="off" value="${escapeHtml(
            store.get(LAST_NAME_KEY, "")
          )}" placeholder="예: 손절금지">
        </label>
        ${
          run.shotRaw || camOn
            ? `<div class="shotask"><span>📸 웹캠으로 기념사진을 찍어서 기록 옆에 남길까요? 누르면 3초 뒤에 찍혀요.</span></div>`
            : ""
        }
        <div class="btns">
          <button class="btn primary big" data-act="saverace">기록 저장</button>
          ${run.shotRaw || camOn ? `<button class="btn big" data-act="saveshot">📸 기념사진 찍고 저장</button>` : ""}
          <button class="btn" data-act="title">저장 안 하고 메뉴로</button>
        </div>
      </div>`
          : `<p class="small">${
              ranked ? "" : "스테이지를 골라서 한 연습은 순위표에 올라가지 않아요. 메뉴의 '체험 시작'이나 '레이스'로 1단계부터 해 보세요."
            }</p>
      <div class="btns"><button class="btn primary big" data-act="title">메뉴로</button></div>`
      }
    </div>`,
    "dim"
  );

  document.body.classList.add("menu-on");
  if (canSave) {
    setTimeout(() => document.getElementById("raceName")?.focus(), 50);
  }
}

export async function saveRace(withShot = false) {
  if (!(run.race || run.trial) || run.saved || run.saving) return;
  run.saving = true; // 저장 중에 Enter를 또 누르면 메뉴로 튕기거나 두 번 저장되던 문제 방지
  const kind = runKind();
  const input = document.getElementById("raceName");
  const name = (input?.value || "").trim().slice(0, 12) || "이름 없는 팀";
  store.set(LAST_NAME_KEY, name);

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    time: Math.round(raceTotal()),
    deaths: raceDeaths(),
    at: Date.now(),
  };
  const camShot = withShot ? await countdownPhoto() : null;
  const shot = withShot ? composeShot(run.shotRaw, name, entry.time, camShot) : null;

  showOverlay(
    `<div class="panel">
      <div class="eyebrow">순위표 저장 중</div>
      <h2>기록을 등록하고 있어요</h2>
      <p class="lead">잠시만 기다려 주세요...</p>
    </div>`,
    "dim"
  );

  const res = await submitScore(entry, kind);
  if (shot) {
    saveShot(res.id, shot);
    if (res.id !== entry.id) saveShot(entry.id, shot); // 로컬 기록으로 보일 때도 사진이 보이게
  }
  run.saved = true;
  run.saving = false;
  SFX.clear();
  showBoard(res.id, kind, entry.id);
}

export async function showBoard(highlight = null, kind = "trial", altId = null) {
  setScreen("board");
  showOverlay(
    `<div class="panel">
      <div class="eyebrow">온라인 순위표</div>
      <h2>기록을 불러오는 중...</h2>
      <p>서버에서 최신 기록을 가져오고 있습니다.</p>
    </div>`,
    "dim"
  );

  const { board, isCloud } = await fetchLeaderboard(kind);
  const shots = loadShots();
  const mine = (e) => e.id === highlight || (altId && e.id === altId);
  const rank = highlight ? board.findIndex(mine) + 1 : 0;
  const rows = board
    .slice(0, 10)
    .map(
      (e, i) =>
        `<tr class="${mine(e) ? "me" : ""}">
        <td>${i + 1}</td>
        <td>${escapeHtml(e.name)}</td>
        <td>${fmt(e.time)}</td>
        <td>${e.deaths}</td>
        <td>${new Date(e.at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}</td>
        <td class="shotcell">${
          shots[e.id] ? `<button class="shotbtn" data-act="shot" data-id="${escapeHtml(e.id)}" data-kind="${kind}"><img src="${shots[e.id].url}" alt="기록 사진"></button>` : ""
        }</td>
      </tr>`
    )
    .join("");
  const tab = (k, t) => `<button class="btn tab${k === kind ? " on" : ""}" data-act="board" data-kind="${k}">${t}</button>`;

  showOverlay(
    `<div class="panel">
      <div class="eyebrow">순위표</div>
      <div class="tabs">${tab("trial", "체험 · 1~3단계")}${tab("race", "레이스 · 5단계")}</div>
      <h2>${rank ? `${rank}위 기록!` : "가장 빠른 탈출"}</h2>
      <p>${kind === "trial" ? "1~3단계를 한 번에 탈출한" : "5단계를 한 번에 탈출한"} 시간 순서예요. ${
        isCloud
          ? '<span class="cloud-badge">☁️ Firebase 실시간 연동 중</span>'
          : '<span class="badge">로컬 브라우저 저장 모드</span>'
      }</p>
      ${
        board.length
          ? `<div class="tblwrap">
        <table class="tbl board">
          <thead><tr><th>순위</th><th>팀</th><th>시간</th><th>죽음</th><th>날짜</th><th>사진</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
          : `<p class="lead">아직 기록이 없어요. 메뉴에서 '${kind === "trial" ? "체험 시작" : "레이스"}'으로 첫 기록을 남겨 보세요.</p>`
      }
      ${rank > 10 ? `<p class="small">이번 기록은 ${rank}위예요 (상위 10개만 보여요).</p>` : ""}
      <p class="small">사진은 이 노트북에만 저장되고, 온라인 순위표에는 이름과 기록만 올라가요.</p>
      <div class="btns">
        <button class="btn primary big" data-act="title">메뉴로</button>
        ${board.length && !isCloud ? `<button class="btn" data-act="clearboard" data-kind="${kind}">로컬 기록 지우기</button>` : ""}
      </div>
    </div>`,
    "dim"
  );
  document.body.classList.add("menu-on");
}

export async function clearBoard(btn, kind = "race") {
  if (btn.dataset.sure !== "1") {
    btn.dataset.sure = "1";
    btn.textContent = "정말 지울까요? 한 번 더 누르면 지워져요";
    return;
  }
  await clearLocalLeaderboard(kind);
  showBoard(null, kind);
}

export function primaryAction() {
  if (screen === "title") {
    startTrial();
  } else if (screen === "intro") {
    startStage(stageIdx);
  } else if (screen === "clear") {
    nextStage();
  } else if (screen === "final") {
    if (run.saving) return;
    if ((run.race || run.trial) && !run.saved && document.getElementById("raceName")) {
      saveRace(false);
    } else {
      goTitle();
    }
  } else if (screen === "board") {
    goTitle();
  } else if (screen === "calres") {
    ov.querySelector('[data-act="calok"]')?.click();
  }
}
