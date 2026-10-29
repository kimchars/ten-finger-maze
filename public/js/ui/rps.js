// 가위바위보 철창 대결 화면 ("가위… 바위… 보!" 카운트와 결과)
import { RPS_CALL, RPS_ICON, RPS_NAME, p2Shape, rpsWins, rpsHist } from "../game/logic.js";

let box = null, lastKey = "";

function ensure() {
  if (box) return box;
  const st = document.createElement("style");
  st.textContent = `
#rpsBox { position: fixed; left: 50%; top: 18%; transform: translateX(-50%); z-index: 30; pointer-events: none;
  min-width: min(420px, 92vw); padding: 14px 22px 12px; border-radius: 16px; text-align: center;
  background: rgba(20, 14, 4, 0.82); border: 1px solid rgba(255, 201, 58, 0.55);
  box-shadow: 0 0 40px rgba(255, 190, 40, 0.25); color: #fff3d0; font-family: inherit; }
#rpsBox .rk { font-size: 12px; letter-spacing: .12em; color: #ffc93a; }
#rpsBox .rbig { font-size: clamp(30px, 6vw, 52px); white-space: nowrap; font-weight: 900; line-height: 1.15; margin: 4px 0; }
#rpsBox .rbig.win { color: #9dff7a; } #rpsBox .rbig.lose { color: #ff7a6a; }
#rpsBox .rvs { font-size: clamp(30px, 6vw, 48px); display: flex; gap: 18px; justify-content: center; align-items: center; }
#rpsBox .rvs small { display: block; font-size: 12px; color: #d9c79a; }
#rpsBox .rfoot { font-size: 13px; color: #d9c79a; margin-top: 6px; }
#rpsBox .rhist { letter-spacing: 2px; }`;
  document.head.appendChild(st);
  box = document.createElement("div");
  box.id = "rpsBox";
  box.hidden = true;
  document.body.appendChild(box);
  return box;
}

const icon = (s) => (s ? RPS_ICON[s] : "❔");

export function drawRps(now, game, screen) {
  const r = screen === "play" && game && !game.won ? game.rps : null;
  if (!r) {
    if (box && !box.hidden) box.hidden = true;
    lastKey = "";
    return;
  }
  ensure();
  const need = game.s.rps[r.ch].wins || 1, won = rpsWins(game, r.ch);
  const hist = rpsHist(game, r.ch).slice(-5).map((h) => icon(h.gate)).join(" ");
  let big = "", cls = "", mid = "";
  if (r.phase === "count") {
    const t = now - r.t0;
    big = t < 0 ? "준비!" : ["가위…", "바위…", "보!"][Math.min(2, Math.floor(t / RPS_CALL))];
    const sh = p2Shape();
    mid = `<div class="rfoot">P2 지금 손: ${sh ? `${icon(sh)} ${RPS_NAME[sh]}` : "❔ (엄지 빼고 네 손가락으로)"}</div>`;
  } else {
    const res = {
      win: r.tired ? ["수문장이 지쳐서 져 줬어요!", "win"] : won >= need ? ["이겼다! 열린다", "win"] : [`이겼다! 한 판 더`, "win"],
      lose: ["졌다… 밀려나요", "lose"],
      draw: ["비겼다! 한 번 더", ""],
      invalid: ["손이 안 보여요! 다시", "lose"],
    }[r.result];
    big = res[0];
    cls = res[1];
    if (r.result !== "invalid") {
      mid = `<div class="rvs"><div>${icon(r.me)}<small>P2</small></div><div style="font-size:18px">VS</div><div>${icon(r.gate)}<small>수문장</small></div></div>`;
    }
  }
  const key = big + cls + mid + won + hist;
  if (key === lastKey) return;
  lastKey = key;
  box.innerHTML = `<div class="rk">가위바위보 철창 · ${need}번 이기면 열림 (${won}/${need})</div>
    <div class="rbig ${cls}">${big}</div>${mid}
    ${hist ? `<div class="rfoot">수문장이 낸 손: <span class="rhist">${hist}</span></div>` : ""}`;
  box.hidden = false;
}
