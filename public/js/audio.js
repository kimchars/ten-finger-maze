// Web Audio API 사운드 시스템
// public/sounds/ 에 팀이 고른 소리 파일이 있으면 그 소리를, 없으면 코드로 만든 합성음을 써요.
import { store, MUTED_KEY } from "./store.js";

let actx = null;
let muted = store.get(MUTED_KEY, false);
let ambient = null;

// ── 소리 파일 ──
// 이름: [파일, 기본 음량]. 파일을 바꾸려면 public/sounds/ 의 같은 이름 파일만 바꾸면 돼요.
const FILES = {
  splash: ["sounds/splash.mp3", 0.8],
  lava: ["sounds/lava.mp3", 0.8],
  monster_loop: ["sounds/monster_loop.mp3", 0.55],
  door_open: ["sounds/door_open.mp3", 0.75],
  stage_clear: ["sounds/stage_clear.mp3", 0.75],
  final_clear: ["sounds/final_clear.mp3", 0.6],
  lantern_on: ["sounds/lantern_on.mp3", 0.8],
  lantern_off: ["sounds/lantern_off.mp3", 0.8],
  caught: ["sounds/caught.mp3", 0.7],
  bridge_up: ["sounds/bridge_up.mp3", 0.6],
  bridge_down: ["sounds/bridge_down.mp3", 0.6],
  bgm: ["sounds/bgm.mp3", 0.22],
  // 가위바위보 카운트 (팀원 목소리, 1.5배속)
  rps_gawi: ["sounds/rps_gawi.mp3", 0.9],
  rps_bawi: ["sounds/rps_bawi.mp3", 0.9],
  rps_bo: ["sounds/rps_bo.mp3", 1.0],
};
const buf = {};
let master = null, loading = false, bgmSrc = null, bgmGain = null, monSrc = null, monGain = null, duckUntil = 0;

// 탭을 다른 데로 옮기면 소리를 멈춰요. 게임 탭을 두 개 열어 두면 배경음이 두 겹으로 들리던 문제 방지.
document.addEventListener("visibilitychange", () => {
  if (!actx) return;
  if (document.hidden) actx.suspend();
  else actx.resume();
});

// 클리어·잡힘 같은 큰 효과음이 나는 동안 배경음을 잠깐 줄여요
function duck(ms) {
  if (!bgmGain || !actx) return;
  duckUntil = performance.now() + ms;
  const t = actx.currentTime;
  bgmGain.gain.cancelScheduledValues(t);
  bgmGain.gain.setTargetAtTime(FILES.bgm[1] * 0.25, t, 0.08);
  bgmGain.gain.setTargetAtTime(FILES.bgm[1], t + ms / 1000, 0.4);
}

function loadSounds() {
  if (loading || !actx) return;
  loading = true;
  master = actx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(actx.destination);
  for (const [name, [url]] of Object.entries(FILES)) {
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((a) => actx.decodeAudioData(a))
      .then((b) => {
        buf[name] = b;
        if (name === "bgm") startBgm();
      })
      .catch(() => {}); // 파일이 없으면 합성음을 그대로 써요
  }
}

export const hasSound = (name) => !!buf[name];

// 파일이 있으면 재생하고 true, 없으면 false (그러면 합성음을 써요)
function play(name, vol) {
  if (!buf[name] || !actx || !master) return false;
  if (muted) return true;
  const s = actx.createBufferSource();
  s.buffer = buf[name];
  const g = actx.createGain();
  g.gain.value = vol ?? FILES[name][1];
  s.connect(g).connect(master);
  s.start();
  return true;
}

function startBgm() {
  if (bgmSrc || !buf.bgm) return;
  bgmSrc = actx.createBufferSource();
  bgmSrc.buffer = buf.bgm;
  bgmSrc.loop = true;
  bgmGain = actx.createGain();
  bgmGain.gain.value = FILES.bgm[1];
  bgmSrc.connect(bgmGain).connect(master);
  bgmSrc.start();
  stopAmbient(); // 배경음 파일이 있으면 합성 배경음은 완전히 꺼요
}

// 괴물 접근음: level 0(멀다) ~ 1(바로 옆). 매 프레임 불러요.
export function setMonsterLevel(level) {
  if (!buf.monster_loop || !actx || !master) return;
  if (!monSrc) {
    monGain = actx.createGain();
    monGain.gain.value = 0;
    monSrc = actx.createBufferSource();
    monSrc.buffer = buf.monster_loop;
    monSrc.loop = true;
    monSrc.connect(monGain).connect(master);
    monSrc.start();
  }
  const want = Math.max(0, Math.min(1, level)) * FILES.monster_loop[1];
  monGain.gain.setTargetAtTime(want, actx.currentTime, 0.15); // 부드럽게 커지고 작아짐
}

export function audioUnlock() {
  if (!actx) {
    // 같은 페이지에 예전 소리 엔진이 남아 있으면 먼저 끄기 (배경음 겹침 방지)
    try {
      window.__tfmAudio?.close();
    } catch {}
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      window.__tfmAudio = actx;
    } catch {
      return;
    }
  }
  if (document.hidden) return; // 다른 탭을 보고 있을 땐 켜지 않아요
  if (actx.state === "suspended") {
    actx.resume();
  }
  if (!ambient) {
    startAmbient();
  }
  loadSounds();
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

let ambientNodes = [];
function stopAmbient() {
  if (!ambient) return;
  ambient.gain.value = 0;
  ambientNodes.forEach((n) => {
    try {
      n.stop();
    } catch {}
  });
  ambientNodes = [];
  try {
    ambient.disconnect();
  } catch {}
}

export function startAmbient() {
  if (!actx || ambient) return;
  const g = actx.createGain();
  g.gain.value = muted || buf.bgm ? 0 : 0.035;
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
    ambientNodes.push(o, lfo);
  });
  lp.connect(g).connect(actx.destination);
  ambient = g;
}

export const SFX = {
  step: () => tone(170 + Math.random() * 40, 0.06, { type: "triangle", vol: 0.05, lp: 700 }),
  open: () => {
    if (play("door_open")) return;
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
    if (play("caught")) return duck(2400);
    tone(90, 0.7, { type: "sawtooth", vol: 0.12, to: 45, lp: 600 });
    tone(700, 0.4, { type: "sawtooth", vol: 0.05, to: 120, lp: 2000 });
  },
  growl: () => {
    tone(62, 0.8, { type: "sawtooth", vol: 0.07, to: 48, lp: 320 });
    tone(66, 0.8, { type: "sawtooth", vol: 0.05, to: 50, lp: 320, delay: 0.03 });
  },
  hide: () => play("lantern_off") || tone(900, 0.18, { vol: 0.05, to: 300 }),
  light: () => play("lantern_on") || tone(500, 0.12, { vol: 0.05, to: 1100 }),
  // 괴물이 가까울 때 주기적으로 나는 으르렁: 접근음 파일이 있으면 그걸로 대신해요
  growlNear: () => hasSound("monster_loop") || SFX.growl(),
  // 스테이지 클리어: 1~4단계와 마지막 단계 소리가 달라요
  // 가위바위보 박자: 0 = 가위, 1 = 바위, 2 = 보
  rpsBeat: (i) => play(["rps_gawi", "rps_bawi", "rps_bo"][i]) || (i < 2 ? SFX.tick() : SFX.bump()),
  stageClear: (last) => {
    duck(last ? 4200 : 2400);
    return play(last ? "final_clear" : "stage_clear") || SFX.clear();
  },
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
    if (play(lava ? "lava" : "splash")) return;
    tone(lava ? 120 : 420, 0.5, { type: "sawtooth", vol: 0.08, to: lava ? 50 : 90, lp: lava ? 500 : 1400 });
    tone(lava ? 200 : 900, 0.3, { type: "triangle", vol: 0.04, to: 300, delay: 0.05 });
  },
  rise: () => play("bridge_up") || tone(260, 0.16, { type: "triangle", vol: 0.05, to: 420, lp: 1200 }),
  sink: () => play("bridge_down") || tone(300, 0.2, { type: "triangle", vol: 0.05, to: 140, lp: 900 }),
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
  if (ambient) ambient.gain.value = muted || buf.bgm ? 0 : 0.035;
  if (master) master.gain.value = muted ? 0 : 1;
  return muted;
}
