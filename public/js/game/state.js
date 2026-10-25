// 게임 런타임 상태, 런(Race/Practice) 데이터 및 스테이지 로더
import { STAGES } from "./stages.js";

export const newRun = (race) => ({
  results: [],
  race,
  extra: 0,
  extraDeaths: 0,
  saved: false,
});

export let run = newRun(false);
export function setRun(newRunObj) {
  run = newRunObj;
}

export let stageIdx = 0;
export function setStageIdx(idx) {
  stageIdx = idx;
}

export let screen = "title";
export function setScreen(s) {
  screen = s;
}

export let game = null;

export function raceTotal() {
  return run.results.reduce((a, r) => a + (r ? r.time : 0), 0) + run.extra;
}

export function raceDeaths() {
  return (
    run.results.reduce((a, r) => a + (r ? r.caught + (r.fall || 0) : 0), 0) + run.extraDeaths
  );
}

export function cellAt([r, c]) {
  return game?.map[r]?.[c] ?? "#";
}

export function exitCell() {
  if (!game) return [0, 0];
  for (let r = 0; r < game.rows; r++) {
    const c = game.map[r].indexOf("E");
    if (c >= 0) return [r, c];
  }
  return [0, 0];
}

export function same(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

export function isBlock(ch) {
  return ch === "#" || ch === "~" || ch === undefined;
}

export function loadStage(i, live) {
  const s = STAGES[i];
  let start = [1, 1];
  s.map.forEach((r, ri) =>
    [...r].forEach((ch, ci) => {
      if (ch === "S") start = [ri, ci];
    })
  );

  game = {
    s,
    map: s.map,
    rows: s.map.length,
    cols: s.map[0].length,
    start,
    pos: [...start],
    prev: [...start],
    from: [...start],
    lastSafe: [...start],
    moveT: 0,
    steps: 0,
    caught: 0,
    push: 0,
    startT: null,
    endT: null,
    won: false,
    pings: s.pings ?? 2,
    pingMax: s.pings ?? 2,
    ping: null,
    p2armed: false,
    lastBeep: 0,
    traps: s.traps ?? 0,
    trapMax: s.traps ?? 0,
    trapArmed: false,
    fall: 0,
    fellAt: 0,
    bridgeState: {},
    bats: (s.bats || []).map((path) => ({
      path,
      i: 0,
      d: 1,
      last: 0,
      from: path[0],
      moveT: 0,
    })),
    batInv: 0,
    trail: [[...start]],
    lastMove: 0,
    lastDir: -1,
    inv: 0,
    live,
    doorOpen: {},
    wasHiding: false,
    guards: s.guards.map((path, k) => {
      const idx = k === 0 ? Math.floor(path.length / 2) : 0;
      return {
        path,
        i: idx,
        d: 1,
        last: 0,
        from: path[idx],
        moveT: 0,
        frozenUntil: 0,
      };
    }),
  };

  return game;
}
