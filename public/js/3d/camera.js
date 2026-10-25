// 3D 시점 추적, UI 가림 영역 보정 오프셋 및 화면 흔들림 제어
import { THREE, cam, scene } from "./engine.js";

export const camCtl = {
  pos: null,
  look: null,
  shakeUntil: 0,
  shakeAmp: 0,
  tp: null,
  tl: null,
};

export const viewShift = { px: 0, cur: 0, force: false };

export function measureHud(camBox) {
  const h = window.innerHeight;
  const topEl = document.querySelector(".top");
  const topB = topEl ? topEl.getBoundingClientRect().bottom : 0;
  const camR = camBox ? camBox.getBoundingClientRect() : { height: 0, top: h };
  const hudTop = camR.height > 0 ? camR.top : h;
  const freeCenter = (topB + hudTop) / 2;
  viewShift.px = Math.max(0, Math.min(h * 0.2, h / 2 - freeCenter));
  viewShift.force = true;
}

export function shake(ms, amp) {
  camCtl.shakeUntil = performance.now() + ms;
  camCtl.shakeAmp = amp;
}

export function updateCamera(now, dt, world, screen, glCanvas) {
  if (!world || !cam) return;
  const V = THREE.Vector3;
  if (!camCtl.pos) {
    camCtl.pos = cam.position.clone();
    camCtl.look = new V();
  }
  if (!camCtl.tp) {
    camCtl.tp = new V();
    camCtl.tl = new V();
  }

  const span = world.span, asp = cam.aspect;
  const over = Math.max(world.cols / Math.max(asp, 0.6), world.rows * 1.15) * 1.05 + 2;
  const tp = camCtl.tp, tl = camCtl.tl;
  let k = 0.0025, fogD = 0.05;

  if (screen === "play") {
    const p = world.player.g.position;
    const z = span > 12 ? 1 : 0.85;
    tp.set(p.x, 9.0 * z, p.z + 3.7 * z);
    tl.set(p.x, 0, p.z + 0.15);
    k = 0.006;
    fogD = 0.045;
  } else if (screen === "clear") {
    const e = world.exitPos;
    tp.set(e.x + 0.3, 4.2, e.z + 2.4);
    tl.set(e.x, 0.6, e.z);
    k = 0.003;
    fogD = 0.04;
  } else if (screen === "intro") {
    tp.set(0, over * 0.95, over * 0.55);
    tl.set(0, 0, 0.4);
    k = 0.0028;
    fogD = 0.018;
  } else {
    const a = now * 0.00006;
    tp.set(Math.sin(a) * span * 0.55 + 2, span * 0.55 + 3, Math.cos(a) * span * 0.55);
    tl.set(-1.5, 0, 0);
    k = 0.0015;
    fogD = 0.028;
  }

  const f = 1 - Math.exp(-dt * k);
  camCtl.pos.lerp(tp, f);
  camCtl.look.lerp(tl, f);
  scene.fog.density += (fogD - scene.fog.density) * f;
  cam.position.copy(camCtl.pos);

  if (now < camCtl.shakeUntil) {
    const a = camCtl.shakeAmp * ((camCtl.shakeUntil - now) / 400);
    cam.position.x += (Math.random() - 0.5) * a;
    cam.position.y += (Math.random() - 0.5) * a;
  }
  cam.lookAt(camCtl.look);

  // HUD 영역을 피하도록 시야 오프셋 적용
  const want = screen === "play" || screen === "clear" ? viewShift.px : 0;
  if (viewShift.force || Math.abs(want - viewShift.cur) > 0.5) {
    viewShift.force = false;
    viewShift.cur += (want - viewShift.cur) * Math.min(1, dt / 120);
    const w = glCanvas.clientWidth || window.innerWidth;
    const h = glCanvas.clientHeight || window.innerHeight;
    cam.setViewOffset(w, h, 0, viewShift.cur, w, h);
  }
}
