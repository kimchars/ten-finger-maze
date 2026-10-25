// 게임 물리, 충돌 판정, 이동 제어, 함정/소나 및 괴물 상호작용 로직
import {
  DIRS,
  STEP_MS,
  MOVE_MS,
  INVULN_MS,
  BAT_MS,
  GUARD_MS,
  FREEZE_MS,
  TRAP_RANGE,
  PING_WINDOW,
  FINGER,
  FCOL,
} from "../config.js";
import { on, amtOf, keyP2 } from "../input.js";
import { trk, sens } from "../hand/tracker.js";
import { camOn } from "../hand/camera.js";
import { SFX } from "../audio.js";
import { shake } from "../3d/camera.js";
import { fx } from "../3d/particles.js";
import { isDoorCh, isBridge, doorNeeds, bridgeNeeds } from "../3d/world.js";
import { isBlock, cellAt, same, exitCell } from "./state.js";
import { say, setHint, clearHint } from "../ui/toast.js";

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

export const bridgeUp = (game, ch) =>
  p2Count() <= 2 && bridgeNeeds(game, ch).every((f) => on(2, f));

export const fingerNames = (list) => list.map((f) => FINGER[f]).join("+");
export const doorName = (game, ch) => doorNeeds(game, ch).map((f) => FINGER[f]).join("+");

export function fireTrap(game, now, world) {
  if (!game || game.won || game.trapMax <= 0) return;
  if (game.traps <= 0) {
    SFX.empty();
    say("덫을 모두 썼어요.");
    return;
  }
  let best = null;
  game.guards.forEach((g) => {
    const c = g.path[g.i], d = Math.abs(c[0] - game.pos[0]) + Math.abs(c[1] - game.pos[1]);
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

  if (isBridge(game, ch) && !bridgeUp(game, ch)) {
    if (fresh) {
      SFX.bump();
      say(
        p2Count() > 2
          ? "P2가 손가락을 3개 이상 구부려서 다리가 가라앉았어요."
          : `다리가 가라앉아 있어요. P2가 ${fingerNames(bridgeNeeds(game, ch))}를 구부려야 떠올라요.`
      );
    }
    return;
  }

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
  if (screen !== "play" || !game || game.won) return;

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

  // 다리 부상/침강 효과음
  if (game.s.bridges) {
    for (const ch of Object.keys(game.s.bridges)) {
      const u = bridgeUp(game, ch);
      if (game.bridgeState[ch] !== undefined && game.bridgeState[ch] !== u) {
        (u ? SFX.rise : SFX.sink)();
      }
      game.bridgeState[ch] = u;
    }
  }

  // 다리 침몰 판정
  const here = cellAt(game.pos);
  if (isBridge(game, here) && !bridgeUp(game, here) && now - game.fellAt > 400) {
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
      game.s.liquid === "lava"
        ? "용암에 빠졌어요! 다리 앞으로 돌아가요."
        : "물에 빠졌어요! 다리 앞으로 돌아가요.",
      3000
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
  let dirs = [1, 2, 3, 4].filter((i) => on(1, i));
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
    const d = dirs[0], fresh = d !== game.lastDir;
    if (fresh || now - game.lastMove >= MOVE_MS) {
      tryMove(game, d, now, fresh, world, onStageClear);
    }
    game.lastDir = d;
  } else {
    game.lastDir = -1;
  }

  // P2 힌트 안내
  if (!hint) {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ch = cellAt([game.pos[0] + dr, game.pos[1] + dc]);
      if (!isDoorCh(game, ch)) continue;
      const n = doorNeeds(game, ch), st = strayFingers(n);
      if (n.every((f) => on(2, f)) && st.length) {
        hint = `P2: ${fingerNames(st)}는 펴요`;
        break;
      }
    }
  }
  setHint(hint);

  // P2 제스처 감지 (소나 핑 / 덫)
  const t2 = trk[2];
  if (now - t2.seen < 300) {
    const b = t2.bent;
    if (b.every((x) => !x)) {
      game.p2armed = true;
    } else if (game.p2armed && b.every((x) => x)) {
      game.p2armed = false;
      firePing(game, now, world, document.getElementById("sonarBox"));
    }
    const shaka = !b[0] && b[1] && b[2] && b[3] && !b[4];
    if (!shaka) {
      game.trapArmed = true;
    } else if (game.trapArmed) {
      game.trapArmed = false;
      fireTrap(game, now, world);
    }
  } else {
    game.p2armed = false;
    game.trapArmed = false;
  }

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

  // 괴물 순찰 및 피격
  for (const g of game.guards) {
    if (now < g.frozenUntil) {
      g.last = now;
      continue;
    }
    if (now - g.last < GUARD_MS) continue;
    g.last = now;
    g.from = g.path[g.i];
    g.moveT = now;
    if (g.i + g.d < 0 || g.i + g.d >= g.path.length) g.d *= -1;
    g.i += g.d;
  }

  if (
    !game.won &&
    !hiding &&
    now > game.inv &&
    game.guards.some((g) => now >= g.frozenUntil && same(g.path[g.i], game.pos))
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
