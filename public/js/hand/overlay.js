// 웹캠 화면 위 손 골격 및 손가락 관절 시각화 오버레이
import { CONN, TIPS, FCOL, COL_P1, COL_P2 } from "../config.js";
import { trk } from "./tracker.js";
import { camOn, handsNow } from "./camera.js";

let overlay = null;
let octx = null;
let video = null;
const ovSize = { w: 200, h: 150 };
let overlayCleared = false;

export function initOverlay(canvasElement, videoElement) {
  overlay = canvasElement;
  octx = overlay.getContext("2d");
  video = videoElement;

  new ResizeObserver((entries) => {
    const r = entries[0].contentRect;
    ovSize.w = r.width;
    ovSize.h = r.height;
  }).observe(overlay);
}

export function drawOverlay() {
  if (!overlay || !octx) return;
  const w = ovSize.w, h = ovSize.h, dpr = window.devicePixelRatio || 1;

  if (!camOn && overlayCleared) return;
  overlayCleared = !camOn;

  if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(h * dpr)) {
    overlay.width = Math.round(w * dpr);
    overlay.height = Math.round(h * dpr);
  }

  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, w, h);

  if (!camOn || !video) return;

  const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
  const s = Math.max(w / vw, h / vh), ox = (w - vw * s) / 2, oy = (h - vh * s) / 2;
  const X = (p) => ox + (1 - p.x) * vw * s;
  const Y = (p) => oy + p.y * vh * s;

  // 좌우 P1 / P2 분할 점선
  octx.strokeStyle = "rgba(255,255,255,0.25)";
  octx.setLineDash([3, 5]);
  octx.lineWidth = 1;
  octx.beginPath();
  octx.moveTo(w / 2, 0);
  octx.lineTo(w / 2, h);
  octx.stroke();
  octx.setLineDash([]);

  // 각 손 골격 및 관절 렌더링
  [[handsNow.a, 1, COL_P1], [handsNow.b, 2, COL_P2]].forEach(([hand, p, col]) => {
    if (!hand) return;
    const lm = hand.lm;
    octx.strokeStyle = col;
    octx.lineWidth = 2;
    octx.lineCap = "round";

    CONN.forEach(([i, j]) => {
      octx.beginPath();
      octx.moveTo(X(lm[i]), Y(lm[i]));
      octx.lineTo(X(lm[j]), Y(lm[j]));
      octx.stroke();
    });

    TIPS.forEach((ti, f) => {
      const bent = trk[p].bent[f];
      octx.beginPath();
      octx.arc(X(lm[ti]), Y(lm[ti]), bent ? 6 : 3.5, 0, Math.PI * 2);
      octx.fillStyle = bent ? FCOL[f] : col;
      octx.fill();
    });
  });
}
