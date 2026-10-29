// 2D 소나 핑 레이더 디스플레이 (음파 탐지기 스윕 애니메이션 및 반사파 블립)
import { SWEEP_MS, BLIP_MS, COL_P1, PING_WINDOW } from "../config.js";

export const radar = { blips: [], lastA: 0 };
let radarCv = null;
let rctx = null;

export function initRadarCanvas(canvas) {
  radarCv = canvas;
  rctx = radarCv.getContext("2d");
}

export function drawRadar(now, game, screen, exitCellFn) {
  if (!radarCv || !rctx) return;
  const S = radarCv.width, cx = S / 2, R = S / 2 - 6, g = rctx;
  g.clearRect(0, 0, S, S);

  g.fillStyle = "rgba(6, 22, 30, 0.85)";
  g.beginPath();
  g.arc(cx, cx, R, 0, Math.PI * 2);
  g.fill();

  g.strokeStyle = "rgba(143, 220, 255, 0.18)";
  g.lineWidth = 1.5;
  [0.33, 0.66, 1].forEach((k) => {
    g.beginPath();
    g.arc(cx, cx, R * k, 0, Math.PI * 2);
    g.stroke();
  });
  g.beginPath();
  g.moveTo(cx - R, cx);
  g.lineTo(cx + R, cx);
  g.moveTo(cx, cx - R);
  g.lineTo(cx, cx + R);
  g.stroke();

  if (!game) return;

  const a = ((now % SWEEP_MS) / SWEEP_MS) * Math.PI * 2;
  // 스윕 잔상 빔
  for (let k = 0; k < 24; k++) {
    const aa = a - k * 0.035;
    g.strokeStyle = `rgba(143, 220, 255, ${0.5 * (1 - k / 24) ** 2})`;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(cx, cx);
    g.lineTo(cx + Math.sin(aa) * R, cx - Math.cos(aa) * R);
    g.stroke();
  }

  const span = Math.max(game.cols, game.rows) * 0.8, k = R / span;
  const P = game.pos;
  const bearing = (cell) => Math.atan2(cell[1] - P[1], -(cell[0] - P[0]));
  const passed = (ang) => {
    const T = Math.PI * 2;
    const d1 = (((ang - radar.lastA) % T) + T) % T;
    const sw = (((a - radar.lastA) % T) + T) % T;
    return d1 <= sw;
  };

  if (screen === "play") {
    const pg = game.ping;
    if (pg && pg.echoed && now - pg.t0 < PING_WINDOW && exitCellFn) {
      const ex = exitCellFn();
      if (passed(bearing(ex))) {
        radar.blips.push({ kind: "exit", cell: ex, t: now });
      }
    }
    game.guards.forEach((gd) => {
      const c = gd.cell;
      if (Math.abs(c[0] - P[0]) + Math.abs(c[1] - P[1]) <= 5 && passed(bearing(c))) {
        radar.blips.push({ kind: now < gd.frozenUntil ? "ice" : "mon", cell: [...c], t: now });
      }
    });
  }

  radar.lastA = a;
  radar.blips = radar.blips.filter((b) => now - b.t < BLIP_MS * (b.strong ? 1.5 : 1));

  for (const b of radar.blips) {
    const dx = (b.cell[1] - P[1]) * k, dy = (b.cell[0] - P[0]) * k;
    const d = Math.hypot(dx, dy);
    const s2 = d > R - 6 ? (R - 6) / d : 1;
    const x = cx + dx * s2, y = cx + dy * s2;
    const life = 1 - (now - b.t) / (BLIP_MS * (b.strong ? 1.5 : 1));
    const colr = b.kind === "exit" ? "143, 220, 255" : b.kind === "ice" ? "210, 240, 255" : "255, 70, 50";
    const rad = (b.kind === "exit" ? 7 : 5.5) * (b.strong ? 1.3 : 1);

    const grd = g.createRadialGradient(x, y, 0, x, y, rad * 2.4);
    grd.addColorStop(0, `rgba(${colr}, ${life})`);
    grd.addColorStop(1, `rgba(${colr}, 0)`);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, rad * 2.4, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = `rgba(255, 255, 255, ${life})`;
    g.beginPath();
    g.arc(x, y, rad * 0.45, 0, Math.PI * 2);
    g.fill();
  }

  // 플레이어(P1) 중심점
  g.fillStyle = COL_P1;
  g.beginPath();
  g.arc(cx, cx, 5, 0, Math.PI * 2);
  g.fill();

  g.strokeStyle = "rgba(143, 220, 255, 0.6)";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cx, R, 0, Math.PI * 2);
  g.stroke();
}
