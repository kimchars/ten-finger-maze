// 메뉴, 인트로, 클리어, 최종 결과 및 순위표 오버레이 화면 관리
import { STAGES } from "../game/stages.js";
import { store, BEST_KEY, LAST_NAME_KEY } from "../store.js";
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
    } else if (act === "stage") {
      setRun(newRun(false));
      showIntro(Number(b.dataset.i));
    } else if (act === "board") {
      showBoard();
    } else if (act === "saverace") {
      saveRace();
    } else if (act === "clearboard") {
      clearBoard(b);
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

export function setStageLabel() {
  const s = STAGES[stageIdx];
  if (stageLabelEl) {
    stageLabelEl.innerHTML = `<b>${stageIdx + 1}. ${s.name}</b> · ${s.tag}`;
  }
}

export function goTitle() {
  if (run.race && screen !== "final") setRun(newRun(false));
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
        <button class="mbtn" data-act="start">레이스 시작 <small>ENTER</small></button>
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
      <div class="eyebrow">${s.tag} · ${i + 1} / ${STAGES.length}</div>
      <h2>${s.name}</h2>
      <p class="lead">${s.desc}</p>
      <p>${s.tip}</p>
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
  say(restart ? "다시 시작해요." : STAGES[i].tip, 3400);
}

export function nextStage() {
  if (stageIdx + 1 < STAGES.length) {
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
  SFX.clear();

  const last = i + 1 >= STAGES.length;
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
  const rows = STAGES.map((s, i) => {
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

  const done = run.results.filter(Boolean);
  const total = done.reduce((a, r) => a + r.time, 0);
  const raceDone = run.race && done.length === STAGES.length && !run.saved;

  showOverlay(
    `<div class="panel">
      <div class="eyebrow">최종 결과</div>
      <h2>${done.length === STAGES.length ? "모든 미로 탈출" : `${done.length}개 미로 탈출`}</h2>
      <p class="lead">합계 ${fmt(total)} · 잡힘 ${done.reduce(
      (a, r) => a + r.caught,
      0
    )}번 · 빠짐 ${done.reduce((a, r) => a + (r.fall || 0), 0)}번 · 밀려남 ${done.reduce(
      (a, r) => a + r.push,
      0
    )}번</p>
      <div class="tblwrap">
        <table class="tbl">
          <thead>
            <tr><th>스테이지</th><th>시간</th><th>걸음</th><th>잡힘</th><th>밀려남</th><th>빠짐</th><th>남은 핑</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${
        raceDone
          ? `<div class="racebox">
        <div class="racebig">
          <div><span>레이스 기록</span><b>${fmt(raceTotal())}</b></div>
          <div><span>죽은 횟수</span><b>${raceDeaths()}</b></div>
        </div>
        ${run.extra > 0 ? `<p class="small">다시 하기로 버린 시도 ${fmt(run.extra)} 포함</p>` : ""}
        <label class="namefield" for="raceName">팀 이름
          <input id="raceName" maxlength="12" autocomplete="off" value="${escapeHtml(
            store.get(LAST_NAME_KEY, "")
          )}" placeholder="예: 손절금지">
        </label>
        <div class="btns">
          <button class="btn primary big" data-act="saverace">순위표에 올리기</button>
          <button class="btn" data-act="title">저장 안 하고 메뉴로</button>
        </div>
      </div>`
          : `<p class="small">${
              run.race
                ? ""
                : "스테이지를 골라서 한 연습은 순위표에 올라가지 않아요. 메뉴의 '레이스 시작'으로 1단계부터 해 보세요."
            }</p>
      <div class="btns"><button class="btn primary big" data-act="title">메뉴로</button></div>`
      }
    </div>`,
    "dim"
  );

  document.body.classList.add("menu-on");
  if (raceDone) {
    setTimeout(() => document.getElementById("raceName")?.focus(), 50);
  }
}

export async function saveRace() {
  if (!run.race || run.saved || run.saving) return;
  run.saving = true; // 저장 중에 Enter를 또 누르면 메뉴로 튕기거나 두 번 저장되던 문제 방지
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

  showOverlay(
    `<div class="panel">
      <div class="eyebrow">순위표 저장 중</div>
      <h2>기록을 등록하고 있어요</h2>
      <p class="lead">잠시만 기다려 주세요...</p>
    </div>`,
    "dim"
  );

  const res = await submitScore(entry);
  run.saved = true;
  run.saving = false;
  SFX.clear();
  showBoard(res.id);
}

export async function showBoard(highlight = null) {
  setScreen("board");
  showOverlay(
    `<div class="panel">
      <div class="eyebrow">온라인 순위표</div>
      <h2>기록을 불러오는 중...</h2>
      <p>서버에서 최신 기록을 가져오고 있습니다.</p>
    </div>`,
    "dim"
  );

  const { board, isCloud } = await fetchLeaderboard();
  const rank = highlight ? board.findIndex((e) => e.id === highlight) + 1 : 0;
  const rows = board
    .slice(0, 10)
    .map(
      (e, i) =>
        `<tr class="${e.id === highlight ? "me" : ""}">
        <td>${i + 1}</td>
        <td>${escapeHtml(e.name)}</td>
        <td>${fmt(e.time)}</td>
        <td>${e.deaths}</td>
        <td>${new Date(e.at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}</td>
      </tr>`
    )
    .join("");

  showOverlay(
    `<div class="panel">
      <div class="eyebrow">레이스 순위표</div>
      <h2>${rank ? `${rank}위 기록!` : "가장 빠른 탈출"}</h2>
      <p>5단계를 한 번에 탈출한 시간 순서예요. ${
        isCloud
          ? '<span class="cloud-badge">☁️ Firebase 실시간 연동 중</span>'
          : '<span class="badge">로컬 브라우저 저장 모드</span>'
      }</p>
      ${
        board.length
          ? `<div class="tblwrap">
        <table class="tbl board">
          <thead><tr><th>순위</th><th>팀</th><th>시간</th><th>죽음</th><th>날짜</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
          : `<p class="lead">아직 기록이 없어요. 메뉴에서 '레이스 시작'으로 첫 기록을 남겨 보세요.</p>`
      }
      ${rank > 10 ? `<p class="small">이번 기록은 ${rank}위예요 (상위 10개만 보여요).</p>` : ""}
      <div class="btns">
        <button class="btn primary big" data-act="title">메뉴로</button>
        ${board.length ? `<button class="btn" data-act="clearboard">로컬 기록 지우기</button>` : ""}
      </div>
    </div>`,
    "dim"
  );
  document.body.classList.add("menu-on");
}

export async function clearBoard(btn) {
  if (btn.dataset.sure !== "1") {
    btn.dataset.sure = "1";
    btn.textContent = "정말 지울까요? 한 번 더 누르면 지워져요";
    return;
  }
  await clearLocalLeaderboard();
  showBoard();
}

export function primaryAction() {
  if (screen === "title") {
    setRun(newRun(true));
    showIntro(0);
  } else if (screen === "intro") {
    startStage(stageIdx);
  } else if (screen === "clear") {
    nextStage();
  } else if (screen === "final") {
    if (run.saving) return;
    if (run.race && !run.saved && document.getElementById("raceName")) {
      saveRace();
    } else {
      goTitle();
    }
  } else if (screen === "board") {
    goTitle();
  } else if (screen === "calres") {
    ov.querySelector('[data-act="calok"]')?.click();
  }
}
