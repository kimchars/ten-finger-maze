// Web Audio API 사운드 시스템 (외부 오디오 파일 없이 합성음 생성)
import { store, MUTED_KEY } from "./store.js";

let actx = null;
let muted = store.get(MUTED_KEY, false);
let ambient = null;

export function audioUnlock() {
  if (!actx) {
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
  }
  if (actx.state === "suspended") {
    actx.resume();
  }
  if (!ambient) {
    startAmbient();
  }
}

export function tone(f, d, { type = "sine", vol = 0.12, to = null, delay = 0, lp = 0, pan = 0 } = {}) {
  if (muted || !actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  let node = o;
  if (lp) {
    const f2 = actx.createBiquadFilter();
    f2.type = "lowpass";
    f2.frequency.value = lp;
    o.connect(f2);
    node = f2;
  }
  node.connect(g);
  if (pan && actx.createStereoPanner) {
    const pn = actx.createStereoPanner();
    pn.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(pn).connect(actx.destination);
  } else {
    g.connect(actx.destination);
  }
  o.start(t);
  o.stop(t + d + 0.05);
}

export function startAmbient() {
  if (!actx) return;
  const g = actx.createGain();
  g.gain.value = muted ? 0 : 0.035;
  const lp = actx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 260;
  [55, 82.4, 110.3].forEach((f, i) => {
    const o = actx.createOscillator();
    o.type = i === 2 ? "triangle" : "sine";
    o.frequency.value = f;
    const og = actx.createGain();
    og.gain.value = i === 2 ? 0.25 : 0.6;
    const lfo = actx.createOscillator();
    lfo.frequency.value = 0.07 + i * 0.05;
    const lg = actx.createGain();
    lg.gain.value = 0.25;
    lfo.connect(lg).connect(og.gain);
    lfo.start();
    o.connect(og).connect(lp);
    o.start();
  });
  lp.connect(g).connect(actx.destination);
  ambient = g;
}

export const SFX = {
  step: () => tone(170 + Math.random() * 40, 0.06, { type: "triangle", vol: 0.05, lp: 700 }),
  open: () => {
    tone(220, 0.25, { type: "sawtooth", vol: 0.05, to: 330, lp: 900 });
    tone(660, 0.15, { type: "triangle", vol: 0.05, delay: 0.12 });
  },
  close: () => {
    tone(330, 0.2, { type: "sawtooth", vol: 0.06, to: 110, lp: 900 });
    tone(90, 0.18, { type: "square", vol: 0.05, delay: 0.12, lp: 400 });
  },
  bump: () => tone(110, 0.1, { type: "square", vol: 0.04, lp: 500 }),
  push: () => tone(300, 0.3, { type: "sawtooth", vol: 0.07, to: 70, lp: 1200 }),
  caught: () => {
    tone(90, 0.7, { type: "sawtooth", vol: 0.12, to: 45, lp: 600 });
    tone(700, 0.4, { type: "sawtooth", vol: 0.05, to: 120, lp: 2000 });
  },
  growl: () => {
    tone(62, 0.8, { type: "sawtooth", vol: 0.07, to: 48, lp: 320 });
    tone(66, 0.8, { type: "sawtooth", vol: 0.05, to: 50, lp: 320, delay: 0.03 });
  },
  hide: () => tone(900, 0.18, { vol: 0.05, to: 300 }),
  light: () => tone(500, 0.12, { vol: 0.05, to: 1100 }),
  clear: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { type: "triangle", vol: 0.09, delay: i * 0.1 })),
  start: () => {
    tone(196, 0.5, { type: "sawtooth", vol: 0.05, lp: 700 });
    tone(392, 0.4, { type: "triangle", vol: 0.07, delay: 0.15 });
  },
  tick: () => tone(1250, 0.03, { vol: 0.04 }),
  ping: () => {
    tone(1480, 1.4, { vol: 0.09, to: 1180 });
    tone(2960, 0.5, { vol: 0.02 });
    tone(1480, 1.0, { vol: 0.025, to: 1180, delay: 0.32 });
  },
  echo: (pan, near) => {
    tone(880 + near * 500, 0.7, { vol: 0.07, pan, to: 760 + near * 400 });
    tone(880 + near * 500, 0.5, { vol: 0.02, pan: -pan * 0.5, delay: 0.2 });
  },
  beep: (pan, near) => tone(700 + near * 700, 0.06, { type: "triangle", vol: 0.035, pan }),
  bats: () => [2600, 3100, 2800, 3400, 2900].forEach((f, i) => tone(f, 0.05, { type: "square", vol: 0.025, delay: i * 0.045, lp: 4000 })),
  splash: (lava) => {
    tone(lava ? 120 : 420, 0.5, { type: "sawtooth", vol: 0.08, to: lava ? 50 : 90, lp: lava ? 500 : 1400 });
    tone(lava ? 200 : 900, 0.3, { type: "triangle", vol: 0.04, to: 300, delay: 0.05 });
  },
  rise: () => tone(260, 0.16, { type: "triangle", vol: 0.05, to: 420, lp: 1200 }),
  sink: () => tone(300, 0.2, { type: "triangle", vol: 0.05, to: 140, lp: 900 }),
  freeze: () => [1568, 2093, 2637, 3136].forEach((f, i) => tone(f, 0.35, { vol: 0.045, delay: i * 0.05 })),
  empty: () => {
    tone(300, 0.12, { type: "square", vol: 0.04, lp: 800 });
    tone(220, 0.16, { type: "square", vol: 0.04, lp: 800, delay: 0.1 });
  },
  done: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.4, { type: "triangle", vol: 0.08, delay: i * 0.09 })),
};

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  store.set(MUTED_KEY, muted);
  if (ambient) ambient.gain.value = muted ? 0 : 0.035;
  return muted;
}
