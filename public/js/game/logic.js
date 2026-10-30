// 게임 물리, 충돌 판정, 이동 제어, 함정/소나 및 괴물 상호작용 로직
import {
  DIRS,
  STEP_MS,
  MOVE_MS,
  INVULN_MS,
  BAT_MS,
  GUARD_MS,
  CHASE_MS,
  ALERT_MS,
  SEARCH_MS,
  DAZE_MS,
  LEASH,
  FREEZE_MS,
  TRAP_RANGE,
  PING_WINDOW,
  FINGER,
  FCOL,
} from "../config.js";
import { on, amtOf, allOn, keyP2, keyTapP1, keyTapP2 } from "../input.js";
import { trk, sens } from "../hand/tracker.js";
import { camOn } from "../hand/camera.js";
import { SFX } from "../audio.js";
import { shake } from "../3d/camera.js";
import { fx } from "../3d/particles.js";
import { isDoorCh, isBridge, isRpsCh, doorNeeds, bridgeNeeds } from "../3d/world.js";
import { isBlock, cellAt, same, exitCell } from "./state.js";
import { say, setHint, clearHint } from "../ui/toast.js";
import { store, BRIDGE_KEY } from "../store.js";
import { isBrick } from "../3d/world.js";

export const strayLimit = () => Math.max(sens() + 0.12, 0.72);

export function isStray(i, need, lim) {
  return !need.includes(i) && (keyP2[i] || (trk[2].bent[i] && trk[2].amt[i] > lim));
}

export function strayFingers(need) {
  const lim = strayLimit(), out = [];
  for (let i = 0; i < 5; i++) {
    if (isStray(i, need, lim)) out.push(i);
  }
  return out;
}

export function doorIsOpen(game, ch) {
  if (isRpsCh(game, ch)) return rpsOpen(game, ch);
  const n = doorNeeds(game, ch);
  for (let k = 0; k < n.length; k++) {
    if (!on(2, n[k])) return false;
  }
  const lim = strayLimit();
  for (let i = 0; i < 5; i++) {
    if (isStray(i, n, lim)) return false;
  }
  return true;
}

export const p2Count = () => {
  let n = 0;
  for (let i = 0; i < 5; i++) {
    if (on(2, i)) n++;
  }
  return n;
};

// 다리(울타리) 리듬 규칙
// - P2가 다리 칸의 손가락을 '접는 순간' 그 칸에 다리가 한 칸 생기고, 설정한 시간(기본 2초) 뒤 사라져요.
// - P1이 그 다리에 올라서면 그때부터 다시 그 시간. 그 안에 다음 칸으로 가지 않으면 다리가 사라지며 빠져요.
// - 다시 만들려면 손가락을 폈다가 다시 접어야 해요. (손가락 3개 이상 접으면 만들어지지 않아요)
// - 다리가 없는 물(용암) 칸으로 걸어 들어가면 빠지고, 다리 앞으로 돌아가요.
// 다리 유지 시간: 설정에서 1.5~4초로 바꿀 수 있어요 (기본 2초)
let bridgeSec = Number(store.get(BRIDGE_KEY, 2)) || 2;
export const bridgeMs = () => bridgeSec * 1000;
export const getBridgeSec = () => bridgeSec;
export function setBridgeSec(v) {
  bridgeSec = Math.max(1, Math.min(6, Number(v) || 2));
  store.set(BRIDGE_KEY, bridgeSec);
}
const bridgeCond = (game, ch) => p2Count() <= 2 && bridgeNeeds(game, ch).every((f) => on(2, f));
const bridgeT = (game) => (game.bridgeT ||= {});
const bridgeArm = (game) => (game.bridgeArm ||= {});
export const bridgeLife = (game, ch, now = performance.now()) => {
  const t = bridgeT(game)[ch];
  if (t === undefined) return 0;
  const left = 1 - (now - t) / bridgeMs();
  return left > 0 ? left : 0;
};
export const bridgeUp = (game, ch, now) => bridgeLife(game, ch, now) > 0;
function updateBridges(game, now) {
  if (!game.s.bridges) return;
  const T = bridgeT(game), A = bridgeArm(game);
  for (const ch of Object.keys(game.s.bridges)) {
    const c = bridgeCond(game, ch);
    const tapped = p2Count() <= 2 && bridgeNeeds(game, ch).every((f) => on(2, f) || keyTapP2[f] > 0);
    if (!c && !tapped) A[ch] = true;
    else if (A[ch] !== false || (!c && tapped)) {
      A[ch] = false;
      T[ch] = now; // 손가락을 접은 순간 한 칸 생성
    }
  }
}

// ── 가위바위보 철창 ──
// P1이 금색 철창 쪽으로 가면 수문장이 가위바위보를 걸어와요. "가위… 바위… 보!"에 맞춰 P2가 손 모양을 내요.
// 엄지는 보지 않아요(접든 펴든 상관없음). 검지·중지·약지·새끼 4개로 판정해요.
//   바위 = 4개 모두 접기 / 보 = 4개 모두 펴기 / 가위 = 검지·중지 펴고 약지·새끼 접기
// 이기면 1승(정해진 횟수를 이기면 열림), 비기거나 손 모양이 안 보이면 다시, 지면 P1이 한 칸 밀려나요.
export const RPS_CALL = 520; // 가위 → 바위 → 보 박자 간격
export const RPS_JUDGE = 600; // "보!" 뒤 이 시간까지 낸 손으로 판정 (느린 노트북 인식 지연 포함)
export const RPS_HOLD = 140; // 이만큼 유지된 손 모양만 인정 (인식이 한 번 튀는 것 방지)
export const RPS_SHOW = 1500; // 결과 보여주는 시간
export const RPS_ICON = { rock: "✊", scissors: "✌️", paper: "✋" };
export const RPS_NAME = { rock: "바위", scissors: "가위", paper: "보" };
const BEATS = { rock: "scissors", scissors: "paper", paper: "rock" }; // 왼쪽이 오른쪽을 이김
const WINNER = { rock: "paper", scissors: "rock", paper: "scissors" }; // 이 손을 이기는 손
const ORDER = ["rock", "scissors", "paper"];

export function p2Shape() {
  const b = [1, 2, 3, 4].map((i) => !!on(2, i));
  if (b.every((x) => x)) return "rock";
  if (b.every((x) => !x)) return "paper";
  if (!b[0] && !b[1] && b[2] && b[3]) return "scissors";
  return null;
}

export const rpsWins = (game, ch) => (game.rpsWon && game.rpsWon[ch]) || 0;
export const rpsOpen = (game, ch) => rpsWins(game, ch) >= (game.s.rps[ch].wins || 1);
export const rpsHist = (game, ch) => ((game.rpsHist ||= {})[ch] ||= []);

// 수문장 성격 — 눈치채면 이길 수 있어요
// rock: 바위만 냄 / cycle: 바위→가위→보 순서대로 / copy: P2가 직전에 낸 손을 따라 냄
// counter: P2가 직전에 낸 손을 이기는 손을 냄 / random: 무작위
function gatePick(ai, hist) {
  const last = hist[hist.length - 1];
  if (ai === "rock") return "rock";
  if (ai === "cycle") return ORDER[hist.length % 3];
  if (ai === "copy") return last ? last.me : "rock";
  if (ai === "counter") return last ? WINNER[last.me] : "paper";
  return ORDER[Math.floor(Math.random() * 3)];
}

function startRps(game, ch, now) {
  game.rps = { ch, at: [...game.pos], t0: now + 450, beat: -1, phase: "count", shape: null, since: now, pick: null };
  game.fistArmed = false;
  const need = game.s.rps[ch].wins || 1;
  say(`수문장이 가위바위보를 걸어왔어요! P2가 ${need > 1 ? `${need}번 ` : ""}이기면 열려요.`, 2400);
}

function updateRps(game, now, world) {
  const r = game.rps;
  if (!r) return;
  if (!same(game.pos, r.at) || game.won) {
    game.rps = null; // P1이 자리를 떠나면 대결 취소
    return;
  }
  const t = now - r.t0;
  if (r.phase === "count") {
    const beat = t < 0 ? -1 : Math.min(2, Math.floor(t / RPS_CALL));
    if (beat > r.beat) {
      r.beat = beat;
      SFX.rpsBeat(beat);
    }
    const sh = p2Shape();
    if (sh !== r.shape) {
      r.shape = sh;
      r.since = now;
    }
    // "보!" 직전부터 판정 끝까지, 충분히 유지된 가장 최근 손 모양을 고름
    if (r.shape && t >= 2 * RPS_CALL - 160 && now - r.since >= RPS_HOLD) r.pick = r.shape;
    if (t < 2 * RPS_CALL + RPS_JUDGE) return;

    const cfg = game.s.rps[r.ch], hist = rpsHist(game, r.ch);
    r.phase = "show";
    r.tShow = now;
    if (!r.pick) {
      r.result = "invalid";
      SFX.empty();
      return;
    }
    // 같은 철창에서 mercy번 지면 수문장이 지쳐서 져 줘요 (시연에서 한 팀이 너무 오래 막히지 않게)
    const lost = (game.rpsLoseAt ||= {})[r.ch] || 0;
    const tired = cfg.mercy && lost >= cfg.mercy;
    const gate = tired ? BEATS[r.pick] : gatePick(cfg.ai, hist);
    r.tired = tired;
    r.me = r.pick;
    r.gate = gate;
    hist.push({ me: r.me, gate });
    game.rpsRounds = (game.rpsRounds || 0) + 1;
    r.result = r.me === gate ? "draw" : BEATS[r.me] === gate ? "win" : "lose";
    if (r.result === "win") {
      (game.rpsWon ||= {})[r.ch] = rpsWins(game, r.ch) + 1;
      if (rpsOpen(game, r.ch)) {
        SFX.open();
        SFX.freeze();
        if (world) fx.burst(world.W(...r.at), 50, [0xffc93a, 0xfff2b0, 0xffffff], 2.2);
      } else SFX.light();
    } else if (r.result === "lose") {
      game.rpsLose = (game.rpsLose || 0) + 1;
      game.rpsLoseAt[r.ch] = lost + 1;
      const back = game.trail[game.trail.length - 1];
      const bch = back && cellAt(back);
      if (back && !same(back, game.pos) && !isDoorCh(game, bch) && !isBridge(game, bch) && !isRpsCh(game, bch) && !isBrick(game, bch)) {
        game.from = [...game.pos];
        game.moveT = now;
        game.pos = [...back];
        game.prev = [...back];
        game.lastSafe = [...back];
        game.trail = game.trail.slice(0, Math.max(1, game.trail.length - 1));
        r.at = [...back];
      }
      game.push++;
      shake(260, 0.2);
      SFX.push();
    } else SFX.tick();
    return;
  }
  // 결과 표시가 끝나면: 열렸거나 졌으면 대결 끝, 비김·1승·무효면 바로 다음 판
  if (now - r.tShow < RPS_SHOW) return;
  if (r.result === "lose" || rpsOpen(game, r.ch)) {
    game.rps = null;
    if (r.result !== "lose") say("수문장을 이겼어요! 금색 철창이 열렸어요.", 2200);
    return;
  }
  game.rps = { ...r, t0: now + 250, beat: -1, phase: "count", shape: null, since: now, pick: null, result: null };
}

// ── 벽돌 벽 ──
// P1이 벽돌 바로 앞에 있을 때, P2가 정해진 손가락을 접었다 펼 때마다 벽돌이 한 층씩 깨져요.
// 정해진 횟수를 다 채우면 완전히 뚫려서 지나갈 수 있어요. (멀리서 접으면 안 깨져요)
const brickCfg = (game, ch) => game.s.bricks[ch];
export const brickLeft = (game, ch) => {
  const c = brickCfg(game, ch);
  return c ? Math.max(0, c.hits - ((game.brickHits || {})[ch] || 0)) : 0;
};
export const brickBroken = (game, ch) => brickLeft(game, ch) <= 0;
function nextToBrick(game, ch) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => cellAt([game.pos[0] + dr, game.pos[1] + dc]) === ch);
}
function updateBricks(game, now, world) {
  if (!game.s.bricks) return;
  const H = (game.brickHits ||= {}), A = (game.brickArm ||= {}), T = (game.brickT ||= {});
  for (const ch of Object.keys(game.s.bricks)) {
    if (brickBroken(game, ch)) continue;
    const f = brickCfg(game, ch).finger;
    const held = on(2, f), tapped = keyTapP2[f] > 0;
    if (!held && !tapped) {
      A[ch] = true;
      continue;
    }
    // 새로 접은 순간만 한 번 (접은 채로 있으면 더 안 깨져요). 키보드는 누를 때마다 한 번.
    const fresh = tapped || A[ch] !== false;
    A[ch] = !held;
    if (!fresh || !nextToBrick(game, ch) || now - (T[ch] || 0) < 120) continue;
    T[ch] = now;
    H[ch] = (H[ch] || 0) + (tapped ? keyTapP2[f] : 1); // 한 프레임 사이에 여러 번 누른 키도 모두 세요
    game.brickTotal = (game.brickTotal || 0) + 1;
    const left = brickLeft(game, ch);
    shake(left ? 140 : 380, left ? 0.12 : 0.3);
    if (left) {
      SFX.bump();
      SFX.push();
      setHint(`벽돌 ${left}번 남았어요!`);
    } else {
      SFX.open();
      say("벽돌을 완전히 부쉈어요! 지나갈 수 있어요.", 2200);
    }
  }
}

export const fingerNames = (list) => list.map((f) => FINGER[f]).join("+");
export const doorName = (game, ch) => doorNeeds(game, ch).map((f) => FINGER[f]).join("+");

// 괴물 감지 범위: 스테이지의 sense, senseOnly가 있으면 그 번호의 괴물만 감지해요
export const guardSense = (game, k) => {
  const s = game.s;
  if (!s.sense) return 0;
  return !s.senseOnly || s.senseOnly.includes(k) ? s.sense : 0;
};

// 괴물이 걸을 수 있는 칸: 바닥(.), 출발(S), 출구(E). 철창·다리·물·벽은 못 지나가요.
const guardWalk = (ch) => ch === "." || ch === "S" || ch === "E";
// a에서 b까지 괴물 걸음 수 (limit보다 멀면 Infinity). b가 철창·다리 칸이어도 도착은 인정.
export function guardDist(game, a, b, limit) {
  if (same(a, b)) return 0;
  const seen = new Set([a[0] * 100 + a[1]]);
  let front = [a];
  for (let d = 1; d <= limit; d++) {
    const nxt = [];
    for (const c of front) {
      for (let k = 1; k <= 4; k++) {
        const n = [c[0] + DIRS[k][0], c[1] + DIRS[k][1]];
        if (same(n, b)) return d;
        const key = n[0] * 100 + n[1];
        if (seen.has(key) || !guardWalk(cellAt(n))) continue;
        seen.add(key);
        nxt.push(n);
      }
    }
    front = nxt;
  }
  return Infinity;
}
// a에서 b로 가는 첫 걸음 (없으면 null)
function guardStep(game, a, b) {
  if (same(a, b)) return null;
  const prev = new Map([[a[0] * 100 + a[1], null]]), q = [a];
  while (q.length) {
    const c = q.shift();
    for (let k = 1; k <= 4; k++) {
      const n = [c[0] + DIRS[k][0], c[1] + DIRS[k][1]];
      const key = n[0] * 100 + n[1];
      if (prev.has(key)) continue;
      const goal = same(n, b);
      if (!goal && !guardWalk(cellAt(n))) continue;
      prev.set(key, c);
      if (goal) {
        let s = n, p = c;
        while (!same(p, a)) { s = p; p = prev.get(p[0] * 100 + p[1]); }
        return guardWalk(cellAt(s)) ? s : null; // 철창·다리 칸 안으로는 안 들어가요
      }
      q.push(n);
    }
  }
  return null;
}

export function fireTrap(game, now, world) {
  if (!game || game.won || game.trapMax <= 0) return;
  if (game.traps <= 0) {
    SFX.empty();
    say("덫을 모두 썼어요.");
    return;
  }
  let best = null;
  game.guards.forEach((g) => {
    const c = g.cell, d = Math.abs(c[0] - game.pos[0]) + Math.abs(c[1] - game.pos[1]);
    if (d <= TRAP_RANGE && now >= g.frozenUntil && (!best || d < best.d)) {
      best = { g, d };
    }
  });

  if (!best) {
    SFX.bump();
    say(`${TRAP_RANGE}칸 안에 묶을 괴물이 없어요. 덫은 쓰지 않았어요.`);
    return;
  }

  best.g.frozenUntil = now + FREEZE_MS;
  game.traps--;
  SFX.freeze();
  if (world) {
    const m = world.monsters[game.guards.indexOf(best.g)];
    if (m) fx.burst(m.g.position, 40, [0xbfe9ff, 0x8fdcff, 0xffffff], 2);
  }
  say(`괴물을 묶었어요! ${(FREEZE_MS / 1000).toFixed(1)}초 동안 움직이지 못해요. 남은 덫 ${game.traps}개`, 2400);
}

export function firePing(game, now, world, sonarBox) {
  if (!game || game.won) return;
  if (game.ping && now - game.ping.t0 < 1500) return;
  if (game.pings <= 0) {
    SFX.empty();
    say("소나 핑을 모두 썼어요. 이제 감으로 찾아야 해요.");
    return;
  }
  game.pings--;
  game.ping = {
    t0: now,
    origin: world ? world.W(...game.pos).clone() : null,
    cell: [...game.pos],
    echoed: false,
    hitMon: new Set(),
  };
  SFX.ping();
  if (sonarBox) {
    sonarBox.classList.remove("fired");
    void sonarBox.offsetWidth;
    sonarBox.classList.add("fired");
  }
  say(game.pings > 0 ? `소나 핑! 남은 횟수 ${game.pings}번` : "마지막 소나 핑이에요!", 2200);
}

export function tryMove(game, d, now, fresh, world, onStageClear) {
  game.lastMove = now;
  const [dr, dc] = DIRS[d];
  const next = [game.pos[0] + dr, game.pos[1] + dc];
  const ch = cellAt(next);

  if (isBlock(ch)) {
    if (fresh) SFX.bump();
    return;
  }

  if (isRpsCh(game, ch) && !rpsOpen(game, ch)) {
    if (!game.rps) startRps(game, ch, now);
    return;
  }

  if (isBrick(game, ch) && !brickBroken(game, ch)) {
    if (fresh) {
      SFX.bump();
      const c = brickCfg(game, ch);
      say(`벽돌 벽이에요. P2가 ${FINGER[c.finger]}를 ${brickLeft(game, ch)}번 더 접었다 펴면 부서져요.`, 2600);
    }
    return;
  }

  if (isDoorCh(game, ch) && !doorIsOpen(game, ch)) {
    if (fresh) {
      SFX.bump();
      const n = doorNeeds(game, ch), st = strayFingers(n);
      if (n.every((f) => on(2, f)) && st.length) {
        say(`${fingerNames(st)}도 구부러져 있어요. P2는 ${doorName(game, ch)}만 구부려야 열려요.`);
      } else {
        say(`닫힌 철창이에요. P2가 ${doorName(game, ch)}만 ${n.length > 1 ? "동시에 " : ""}구부려야 열려요.`);
      }
    }
    return;
  }

  // 다리가 없는 칸으로도 들어갈 수 있어요(들어가면 빠짐). 다리 위에 올라서면 그 칸은 시간이 다시 시작돼요.
  if (isBridge(game, ch) && bridgeUp(game, ch, now)) bridgeT(game)[ch] = now;

  game.prev = [...game.pos];
  game.from = [...game.pos];
  game.moveT = now;
  game.trail.push([...game.pos]);
  if (game.trail.length > 8) game.trail.shift();
  game.pos = next;
  game.steps++;

  if (!isDoorCh(game, ch) && !isBridge(game, ch)) {
    game.lastSafe = [...next];
  }
  SFX.step();

  if (game.startT === null) game.startT = now;

  if (ch === "E") {
    game.won = true;
    game.endT = now;
    if (world) {
      fx.burst(world.W(...next), 140, [0xbfefff, 0x7cc4ff, 0xffd2a0, ...FCOL], 3.4);
    }
    if (onStageClear) onStageClear();
  }
}

export function updateGame(game, now, screen, world, flashEl, onStageClear) {
  if (screen !== "play" || !game || game.won) {
    keyTapP1.fill(0);
    keyTapP2.fill(0); // 메뉴·인트로에서 누른 방향키가 시작하자마자 반영되지 않게
    return;
  }

  const hiding = on(1, 0);
  if (hiding !== game.wasHiding) {
    (hiding ? SFX.hide : SFX.light)();
  }
  game.wasHiding = hiding;

  // 문 개폐 효과음
  for (const ch of Object.keys(game.s.doors)) {
    const o = doorIsOpen(game, ch);
    if (game.doorOpen[ch] !== undefined && game.doorOpen[ch] !== o) {
      (o ? SFX.open : SFX.close)();
    }
    game.doorOpen[ch] = o;
  }

  updateBridges(game, now);
  updateBricks(game, now, world);
  keyTapP2.fill(0);

  // 다리 부상/침강 효과음
  if (game.s.bridges) {
    for (const ch of Object.keys(game.s.bridges)) {
      const u = bridgeUp(game, ch, now);
      if (game.bridgeState[ch] !== undefined && game.bridgeState[ch] !== u) {
        (u ? SFX.rise : SFX.sink)();
      }
      game.bridgeState[ch] = u;
    }
  }

  // 다리 침몰 판정
  const here = cellAt(game.pos);
  if (isBridge(game, here) && !bridgeUp(game, here, now) && now - game.fellAt > 400) {
    game.fall++;
    game.fellAt = now;
    if (world) {
      fx.burst(
        world.W(...game.pos),
        50,
        game.s.liquid === "lava" ? [0xff5a10, 0xffb040, 0x401008] : [0x5fb8ff, 0xd8f2ff, 0x1a4a80],
        2.6
      );
    }
    game.from = [...game.lastSafe];
    game.pos = [...game.lastSafe];
    game.prev = [...game.lastSafe];
    game.moveT = now - STEP_MS;
    shake(380, 0.35);
    SFX.splash(game.s.liquid === "lava");
    say(
      `${game.s.liquid === "lava" ? "용암" : "물"}에 빠졌어요! 다리 앞으로 돌아가요. P2가 손가락을 접어 다리를 만들고, P1은 ${bridgeSec}초 안에 건너요.`,
      3400
    );
  }

  // 철창 강제 밀려남 판정
  if (isDoorCh(game, here) && !doorIsOpen(game, here)) {
    game.from = [...game.pos];
    game.moveT = now;
    game.pos = [...game.lastSafe];
    game.prev = [...game.lastSafe];
    game.push++;
    shake(300, 0.25);
    SFX.push();
    if (world) {
      fx.burst(world.W(...game.from), 30, doorNeeds(game, here).map((f) => FCOL[f]), 2);
    }
    say(`${doorName(game, here)} 철창이 닫혀서 밀려났어요. P2, 다 지나갈 때까지 버텨요!`);
  }

  // P1 이동 판정
  let dirs = allOn(1) ? [] : [1, 2, 3, 4].filter((i) => on(1, i)); // 주먹(소나 핑 자세)은 이동 아님
  const tapDir = [1, 2, 3, 4].find((i) => keyTapP1[i] > 0);
  if (!dirs.length && tapDir) dirs = [tapDir]; // 프레임 사이에 눌렀다 뗀 방향키
  let hint = "";
  if (dirs.length > 1) {
    const sorted = dirs.map((i) => [i, amtOf(1, i)]).sort((a, b) => b[1] - a[1]);
    dirs = sorted[0][1] - sorted[1][1] >= 0.15 ? [sorted[0][0]] : [];
    if (!dirs.length) hint = "방향 손가락은 하나만 구부려요";
  }

  if (hiding) {
    game.lastDir = -1;
    hint = "랜턴을 끈 동안에는 움직일 수 없어요";
  } else if (dirs.length === 1) {
    // 한 칸씩 딱딱: 손가락을 한 번 접을 때마다 딱 한 칸만 움직여요.
    // 계속 접고 있어도 더 가지 않고, 손가락을 폈다가 다시 접어야 다음 칸으로 가요.
    // 인식이 잠깐 튀어서 '폈다 접은 것'처럼 보이는 경우(80ms 미만)는 무시해요.
    const d = dirs[0], fresh = d !== game.lastDir;
    if ((fresh && (game.lastDir !== -1 || now - (game.relT ?? -1e9) >= 80)) || keyTapP1[d] > 0) {
      tryMove(game, d, now, fresh, world, onStageClear);
    }
    game.lastDir = d;
  } else {
    if (game.lastDir !== -1) game.relT = now;
    game.lastDir = -1;
  }
  keyTapP1.fill(0);
  updateRps(game, now, world);

  // P2 힌트 안내
  if (!hint) {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ch = cellAt([game.pos[0] + dr, game.pos[1] + dc]);
      if (isBrick(game, ch) && !brickBroken(game, ch)) {
        hint = `P2: ${FINGER[brickCfg(game, ch).finger]}를 접었다 폈다! 벽돌 ${brickLeft(game, ch)}번 남음`;
        break;
      }
      if (isRpsCh(game, ch) && !rpsOpen(game, ch) && !game.rps) {
        hint = "금색 철창: P1이 철창 쪽으로 가면 가위바위보 시작";
        break;
      }
      if (!isDoorCh(game, ch)) continue;
      const n = doorNeeds(game, ch), st = strayFingers(n);
      if (n.every((f) => on(2, f)) && st.length) {
        hint = `P2: ${fingerNames(st)}는 펴요`;
        break;
      }
    }
  }
  if (game.pings > 0 && allOn(1) !== allOn(2)) hint = `${allOn(1) ? "P2" : "P1"}도 주먹을 쥐면 소나 핑`;
  setHint(hint);

  // 소나 핑: P1·P2 두 사람이 동시에 주먹을 쥐면 발사 (0.2초 유지).
  // 스테이지 시작 때 쥐고 있던 주먹(다음 스테이지로 넘어온 주먹)은 한 번 펴야 인정돼요.
  if (game.rps) {
    game.fistArmed = false; // 가위바위보 중 바위를 내도 소나 핑이 나가지 않게
  } else if (allOn(1) && allOn(2)) {
    game.fistOff = 0;
    if (game.fistArmed) {
      game.fistSince ||= now;
      if (now - game.fistSince >= 200) {
        game.fistArmed = false;
        firePing(game, now, world, document.getElementById("sonarBox"));
      }
    }
  } else {
    // 0.25초 이상 확실히 폈을 때만 다시 쏠 준비 (화면이 잠깐 멈춰 손 인식이 끊긴 걸 '폈다'로 오해하지 않게)
    game.fistOff ||= now;
    if (now - game.fistOff >= 250) game.fistArmed = true;
    game.fistSince = 0;
  }
  // 덫은 꺼 둠 (stages.js traps: 0). 키보드 T도 traps가 0이라 동작하지 않아요.

  // 출구 거리 비프음
  const pg = game.ping;
  if (pg && pg.echoed && now - pg.t0 < PING_WINDOW) {
    const ex = exitCell(), d = Math.hypot(ex[0] - game.pos[0], ex[1] - game.pos[1]);
    const near = 1 - Math.min(1, d / Math.max(game.cols, game.rows));
    if (now - game.lastBeep > 180 + (1 - near) * 900) {
      game.lastBeep = now;
      SFX.beep(Math.max(-1, Math.min(1, (ex[1] - game.pos[1]) / 6)), near);
    }
  }

  // 박쥐 이동 및 피격
  for (const b of game.bats) {
    if (now - b.last < BAT_MS) continue;
    b.last = now;
    b.from = b.path[b.i];
    b.moveT = now;
    if (b.i + b.d < 0 || b.i + b.d >= b.path.length) b.d *= -1;
    b.i += b.d;
  }

  if (game.bats.length && !hiding) {
    const close = game.bats.some(
      (b) => Math.abs(b.path[b.i][0] - game.pos[0]) + Math.abs(b.path[b.i][1] - game.pos[1]) <= 2
    );
    if (close) setHint("박쥐 떼가 와요! P1, 엄지를 접어 랜턴을 꺼요");

    if (now > game.batInv && game.bats.some((b) => same(b.path[b.i], game.pos))) {
      const back = game.trail.length >= 3 ? game.trail[game.trail.length - 3] : game.trail[0];
      if (world) fx.burst(world.W(...game.pos), 26, [0x2a2430, 0xffffff, 0x8a7a9a], 2.4);
      game.from = [...game.pos];
      game.moveT = now;
      game.pos = [...back];
      game.prev = [...back];
      game.lastSafe = [...back];
      game.trail = game.trail.slice(0, Math.max(1, game.trail.length - 2));
      game.push++;
      game.batInv = now + 1300;
      shake(260, 0.2);
      SFX.bats();
      say("박쥐 떼에 놀라 뒤로 밀려났어요. 박쥐가 오면 엄지를 접어 랜턴을 꺼요.", 3200);
    }
  }

  // 괴물 순찰 · 감지 · 추격
  // 랜턴을 켠 P1이 감지 범위(스테이지의 sense 칸, 벽을 돌아가는 걸음 수 기준) 안에 들어오면 쫓아와요.
  // 엄지를 접어 랜턴을 끄면 놓치고, 마지막으로 본 자리에서 잠깐 두리번거리다 순찰로 돌아가요.
  let chased = false;
  for (const [gk, g] of game.guards.entries()) {
    const sense = guardSense(game, gk);
    if (now < g.frozenUntil) {
      g.last = now;
      continue;
    }
    const dazed = g.mode !== "chase" && now < (g.dazeUntil || 0);
    const seen = sense > 0 && !hiding && !game.won && !dazed && guardDist(game, g.cell, game.pos, sense) <= sense;
    if (seen) {
      if (g.mode !== "chase") {
        g.mode = "chase";
        g.alertT = now;
        SFX.growl();
        say("괴물에게 들켰어요! 도망치거나 엄지를 접어 랜턴을 끄고 숨어요.", 2200);
      }
      g.lastSeen = [...game.pos];
      g.seenT = now;
    }
    if (g.mode === "chase") chased = true;
    const interval = g.mode === "chase" ? CHASE_MS : GUARD_MS;
    if (now - g.last < interval) continue;
    if (g.mode === "chase" && now - g.alertT < ALERT_MS) continue; // 발견하고 멈칫
    if (g.mode === "search" && now < g.searchUntil) continue; // 두리번
    g.last = now;
    let to = null;
    const home = g.path[g.i];
    if (g.mode === "chase") {
      if (guardDist(game, home, g.cell, LEASH + 1) > LEASH) {
        g.mode = "return"; // 너무 멀리 왔으면 포기
        g.dazeUntil = now + DAZE_MS;
      }
      else if (!seen && same(g.cell, g.lastSeen)) {
        g.mode = "search";
        g.searchUntil = now + SEARCH_MS;
        g.dazeUntil = now + SEARCH_MS + DAZE_MS;
        continue;
      } else to = guardStep(game, g.cell, g.lastSeen);
      if (!to && g.mode === "chase") g.mode = "return";
    }
    if (g.mode === "search") g.mode = "return";
    if (g.mode === "return") {
      if (same(g.cell, home)) g.mode = "patrol";
      else {
        to = guardStep(game, g.cell, home);
        if (!to) {
          g.mode = "patrol";
          g.cell = [...home];
        }
      }
    }
    if (g.mode === "patrol" && !to) {
      if (g.i + g.d < 0 || g.i + g.d >= g.path.length) g.d *= -1;
      g.i += g.d;
      to = g.path[g.i];
    }
    if (to) {
      g.from = [...g.cell];
      g.cell = [...to];
      g.moveT = now;
    }
  }
  if (chased && !hiding && !game.won) setHint("괴물이 쫓아와요! 도망치거나 엄지를 접어 숨어요");

  if (
    !game.won &&
    !hiding &&
    now > game.inv &&
    game.guards.some(
      (g) =>
        now >= g.frozenUntil &&
        (same(g.cell, game.pos) ||
          // 같은 순간에 서로 자리를 바꿔 지나가면(마주 보고 엇갈림) 잡힌 것으로 처리
          (same(g.from, game.pos) && same(g.cell, game.from) &&
            now - g.moveT < 300 && now - game.moveT < 300))
    )
  ) {
    game.caught++;
    if (world) fx.burst(world.W(...game.pos), 60, [0xff3020, 0x7cc4ff, 0x2a0a18], 3);
    game.from = [...game.start];
    game.pos = [...game.start];
    game.prev = [...game.start];
    game.lastSafe = [...game.start];
    game.trail = [[...game.start]];
    game.moveT = now - STEP_MS;
    game.inv = now + INVULN_MS;
    shake(450, 0.5);
    if (flashEl) {
      flashEl.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 500, easing: "ease-out" });
    }
    SFX.caught();
    say("그림자 괴물에게 잡혔어요. 괴물이 다가오면 P1이 엄지를 접어 랜턴을 꺼요.", 3600);
  }
}
