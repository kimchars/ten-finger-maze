// 손가락 각도 계산, 굽힘 정도 추적 및 상태 판정

import {
  DEFAULT_OPEN,
  DEFAULT_CLOSED,
  DEFAULT_RANGE,
  MIN_RANGE,
  LOST_MS,
} from "../config.js";
import { store, CALIB_KEY, SENS_KEY } from "../store.js";

export let aspect = 4 / 3;
export function setAspect(val) {
  aspect = val;
}

const pt = (lm, i) => [lm[i].x * aspect, lm[i].y, lm[i].z * aspect];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const dist = (a, b) => len(sub(a, b));

export function bendAngle(a, b, c) {
  const u = sub(b, a), v = sub(c, b);
  const d = dot(u, v) / (len(u) * len(v) + 1e-9);
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
}

export function metrics(lm) {
  const P = (i) => pt(lm, i);
  const palm = dist(P(0), P(9)) + 1e-6;
  // 엄지 접힘은 두 가지 방법으로 재서 더 큰 값을 써요.
  // ① 엄지 끝이 새끼 뿌리에 가까운 정도 — 엄지를 먼저 접어 손바닥 안에 넣을 때 잘 잡혀요.
  // ② 엄지 끝이 손바닥을 가로질러 넘어온 정도 — 다른 손가락을 먼저 접고 그 위에 엄지를 얹을 때(주먹)
  //    엄지 끝이 새끼 뿌리까지 못 가서 ①만으로는 인식이 안 되던 문제를 보완해요.
  const nearPinky = 1.3 - dist(P(4), P(17)) / palm;
  const ax = sub(P(17), P(5)); // 검지 뿌리 → 새끼 뿌리 방향
  const cross = dot(sub(P(4), P(5)), ax) / (dot(ax, ax) + 1e-9); // 엄지를 펴면 음수, 검지 뿌리를 지나 넘어오면 0보다 커요
  const thumb = Math.max(nearPinky, (0.75 * (cross + 0.3)) / 0.9);
  const curls = [5, 9, 13, 17].map(
    (b) => bendAngle(P(b), P(b + 1), P(b + 2)) + bendAngle(P(b + 1), P(b + 2), P(b + 3))
  );
  return [thumb, ...curls];
}

// 캘리브레이션 데이터 관리
export let calib = store.get(CALIB_KEY, null) || { 1: null, 2: null };
export function setCalib(newCalib) {
  calib = newCalib;
  store.set(CALIB_KEY, calib);
}

// 민감도 관리
let currentSens = store.get(SENS_KEY, 60);
export const sens = () => Number(currentSens) / 100;
export function setSens(val) {
  currentSens = val;
  store.set(SENS_KEY, Number(val));
}
export function getSensPercent() {
  return currentSens;
}

export function calOf(p) {
  return (
    calib[p] || {
      open: DEFAULT_OPEN,
      closed: DEFAULT_CLOSED,
      weak: [false, false, false, false, false],
    }
  );
}

export function makeTracker() {
  return {
    metric: null,
    amt: [0, 0, 0, 0, 0],
    raw: [false, false, false, false, false],
    bent: [false, false, false, false, false],
    cnt: [0, 0, 0, 0, 0],
    seen: -1e9,
  };
}

export const trk = {
  1: makeTracker(),
  2: makeTracker(),
};

export function feed(p, lm, now) {
  const t = trk[p], m = metrics(lm), c = calOf(p);
  const hi = sens(), lo = Math.max(0.15, hi - 0.18);
  // 손 인식 간격이 45ms보다 길면(1초에 22번 미만, 저사양 노트북) 한 번만 보고 바로 인정해요.
  // 빠른 컴퓨터는 지금처럼 2번 연속으로 확인해서 흔들림을 걸러요. (손이 막 다시 보인 경우는 제외)
  const gapMs = now - t.seen;
  const need = gapMs > 45 && gapMs < 300 ? 1 : 2;
  t.metric = m;

  for (let i = 0; i < 5; i++) {
    const range = c.closed[i] - c.open[i];
    const n = range === 0 ? 0 : (m[i] - c.open[i]) / range;
    t.amt[i] = Math.max(0, Math.min(1, n));
    const want = t.bent[i] ? n > lo : n > hi;
    t.raw[i] = want;
    if (want !== t.bent[i]) {
      const strong = want ? n > hi + 0.15 : n < lo - 0.12;
      if (strong || ++t.cnt[i] >= need) {
        t.bent[i] = want;
        t.cnt[i] = 0;
      }
    } else {
      t.cnt[i] = 0;
    }
  }
  t.seen = now;
}

export function settle(t, now) {
  if (now - t.seen > LOST_MS && (t.metric || t.bent.some((b) => b))) {
    t.raw.fill(false);
    t.bent.fill(false);
    t.cnt.fill(0);
    t.metric = null;
  }
  if (now - t.seen > LOST_MS) {
    t.amt = t.amt.map((a) => a * 0.85);
  }
}
