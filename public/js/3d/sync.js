// 매 프레임 3D 월드 동기화 (캐릭터 애니메이션, 괴물 AI/촉수, 철창, 다리, 조명, 소나 파동)
import { THREE, shared } from "./engine.js";
import { STEP_MS, SONAR_SPEED } from "../config.js";
import { on } from "../input.js";
import { SFX } from "../audio.js";
import { fx } from "./particles.js";
import { updateCamera } from "./camera.js";

const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

const _v3 = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q0 = new THREE.Quaternion();
const _s3 = new THREE.Vector3();

let lastGrowl = 0;
let lastDangerOp = "";
let sonarColor = null;

export function sync3D(now, dt, world, game, screen, glCanvas, dangerEl, doorIsOpenFn, bridgeUpFn, exitCellFn, radarBlips) {
  if (!world || !game) return;
  const s = dt / 1000;
  const P = world.player;

  // 1. 탐험가 위치 / 회전 / 걷기
  const k = ease((now - game.moveT) / STEP_MS);
  const a = world.Wto(world.tA, game.from[0], game.from[1]);
  const b = world.Wto(world.tB, game.pos[0], game.pos[1]);
  P.g.position.lerpVectors(a, b, k);

  const moving = k < 1 && !(game.from[0] === game.pos[0] && game.from[1] === game.pos[1]);
  if (moving) {
    P.yaw = lerpAngle(P.yaw, Math.atan2(b.x - a.x, b.z - a.z), Math.min(1, dt / 60));
  }
  P.rig.rotation.y = P.yaw;

  if (moving) P.phase += dt * 0.022;
  else P.phase *= 0.9;

  const sw = Math.sin(P.phase);
  P.legL.rotation.x = sw * 0.75;
  P.legR.rotation.x = -sw * 0.75;
  P.armL.rotation.x = -sw * 0.6;
  P.armR.rotation.x = sw * 0.25 - 0.35;
  P.tailPivot.rotation.x = 0.3 + Math.sin(now / 160) * 0.15 + (moving ? 0.4 : 0);

  const hiding = screen === "play" && on(1, 0) && !game.won;
  P.crouch += ((hiding ? 1 : 0) - P.crouch) * Math.min(1, dt / 90);
  P.rig.scale.set(1 + P.crouch * 0.08, 1 - P.crouch * 0.28, 1 + P.crouch * 0.08);
  P.rig.position.y = Math.abs(Math.sin(P.phase)) * 0.035;

  P.lanternLevel += ((hiding ? 0.02 : 1) - P.lanternLevel) * Math.min(1, dt / 70);
  const flick = 0.92 + Math.sin(now / 47) * 0.04 + Math.sin(now / 113) * 0.04;
  const LL = shared.L.lantern;
  P.lantern.getWorldPosition(LL.position);
  LL.intensity = (game.won ? 0 : 9) * P.lanternLevel * flick;
  P.glowM.emissiveIntensity = 0.2 + 4 * P.lanternLevel;
  P.eyeM.emissiveIntensity = 0.6 + 2.4 * P.lanternLevel;

  const blink = now < game.inv && Math.floor(now / 110) % 2 === 0;
  P.g.visible = !game.won && !blink;
  P.halo.material.opacity = 0.18 + 0.2 * P.lanternLevel;

  // 2. 철창 개폐 애니메이션
  for (const d of world.doorList) {
    const open = doorIsOpenFn(d.ch) ? 1 : 0;
    d.o += (open - d.o) * Math.min(1, dt / 90);
    d.bars.position.y = -1.1 * d.o;
    d.mats.forEach((m) => (m.emissiveIntensity = 2.2 - d.o * 1.4 + Math.sin(now / 300) * 0.2));
    d.glow.material.opacity = 0.25 + d.o * 0.45;
    if (d.label) d.label.material.opacity = 1 - d.o * 0.55;
  }

  // 3. 박쥐 떼 이동
  game.bats.forEach((bat, bi) => {
    const swm = world.bats[bi];
    if (!swm) return;
    const kk = ease((now - bat.moveT) / 240);
    const from = world.Wto(world.tA, bat.from[0], bat.from[1]);
    const to = world.Wto(world.tB, bat.path[bat.i][0], bat.path[bat.i][1]);
    const cx = from.x + (to.x - from.x) * kk;
    const cz = from.z + (to.z - from.z) * kk;
    const tt = now / 1000 + swm.ph;

    for (let k2 = 0; k2 < swm.n; k2++) {
      const a2 = tt * 3.2 + k2 * 0.9;
      const rr = 0.18 + 0.12 * Math.sin(tt * 1.7 + k2);
      _v3.set(cx + Math.cos(a2) * rr, 0.62 + Math.sin(tt * 6 + k2 * 1.3) * 0.1, cz + Math.sin(a2) * rr);
      _q0.setFromAxisAngle(_s3.set(0, 1, 0), -a2);
      _m4.compose(_v3, _q0, _s3.set(0.35 + Math.abs(Math.sin(tt * 22 + k2 * 2)) * 0.9, 1, 1));
      swm.im.setMatrixAt(k2, _m4);
    }
    _q0.identity();
    swm.im.instanceMatrix.needsUpdate = true;
  });

  // 4. 소품 반짝임
  if (world.sparkles.length && Math.random() < dt / 70) {
    const [x, y, z] = world.sparkles[Math.floor(Math.random() * world.sparkles.length)];
    fx.emit(
      x + (Math.random() - 0.5) * 0.1,
      y + 0.05,
      z + (Math.random() - 0.5) * 0.1,
      (Math.random() - 0.5) * 0.15,
      0.25 + Math.random() * 0.3,
      (Math.random() - 0.5) * 0.15,
      world.sparkleColor,
      1.8,
      0.05
    );
  }

  // 5. 다리 부상/침강
  for (const b2 of world.bridges) {
    const up = bridgeUpFn(b2.ch) ? 1 : 0;
    b2.o += (up - b2.o) * Math.min(1, dt / 110);
    b2.g.position.y = -0.32 * (1 - b2.o);
    b2.em.emissiveIntensity = 0.5 + b2.o * 1.6 + Math.sin(now / 280) * 0.15;
    b2.lb.material.opacity = 0.85 + b2.o * 0.15;
  }

  // 6. 물 / 용암 텍스처 스크롤
  if (world.liquid) {
    const lq = world.liquid;
    const tx = lq.userData.lava ? lq.material.emissiveMap : lq.material.map;
    if (tx) {
      tx.offset.x = (now / (lq.userData.lava ? 26000 : 14000)) % 1;
      tx.offset.y = (now / 40000) % 1;
    }
    if (lq.userData.lava) {
      lq.material.emissiveIntensity = 1.5 + Math.sin(now / 900) * 0.25;
      if (Math.random() < dt / 90) {
        const [r, c] = world.liquidCells[Math.floor(Math.random() * world.liquidCells.length)];
        const p = world.W(r, c);
        fx.emit(
          p.x + (Math.random() - 0.5) * 0.8,
          0.05,
          p.z + (Math.random() - 0.5) * 0.8,
          0,
          0.6 + Math.random() * 0.8,
          0,
          0xff8a2a,
          1.4,
          0.3
        );
      }
    }
  }

  // 7. 괴물 순찰 / 촉수 / 시선 AI
  let near = 99;
  game.guards.forEach((gd, i) => {
    const m = world.monsters[i];
    const kk = ease((now - gd.moveT) / 320);
    const from = world.Wto(world.tA, gd.from[0], gd.from[1]);
    const to = world.Wto(world.tB, gd.path[gd.i][0], gd.path[gd.i][1]);
    m.g.position.lerpVectors(from, to, kk);

    if (from.distanceToSquared(to) > 0.01) {
      m.yaw = lerpAngle(m.yaw, Math.atan2(to.x - from.x, to.z - from.z), Math.min(1, dt / 120));
    }

    const dGrid = Math.abs(gd.path[gd.i][0] - game.pos[0]) + Math.abs(gd.path[gd.i][1] - game.pos[1]);
    const frozen = now < gd.frozenUntil;
    if (!frozen) near = Math.min(near, dGrid);

    if (frozen !== m.wasFrozen) {
      m.wasFrozen = frozen;
      m.eyeM.emissive.set(frozen ? 0x7fd8ff : m.MC.eye);
      m.danger.material.color.set(frozen ? 0x8fdcff : m.MC.light);
      if (shared.L.mon[i]) shared.L.mon[i].color.set(frozen ? 0x7fd8ff : m.MC.light);
    }
    if (frozen) {
      if (m.tFrozen === undefined) m.tFrozen = now;
    } else {
      m.tFrozen = undefined;
    }

    const tm = frozen ? m.tFrozen : now;
    const see = screen === "play" && !hiding && !game.won && !frozen && dGrid <= 2;
    if (see) {
      m.yaw = lerpAngle(
        m.yaw,
        Math.atan2(P.g.position.x - m.g.position.x, P.g.position.z - m.g.position.z),
        Math.min(1, dt / 150)
      );
    }

    m.rage += ((see ? 1 : 0) - m.rage) * Math.min(1, dt / 200);
    m.core.rotation.y = m.yaw;
    m.core.position.y = 0.62 + Math.sin(tm / 300 + m.ph) * 0.06;
    m.core.rotation.z = Math.sin(tm / 520 + m.ph) * 0.06;

    const pulse = 1 + Math.sin(tm / 180 + m.ph) * 0.025;
    m.body.scale.setScalar(pulse + m.rage * 0.06);
    m.eyeM.emissiveIntensity = frozen ? 2.2 : 3 + m.rage * 5 + Math.sin(now / 90) * 0.4 * m.rage;

    const ml = shared.L.mon[i];
    if (ml) {
      ml.position.set(m.g.position.x, 0.35 + (m.core.position.y - 0.62), m.g.position.z);
      ml.intensity = 3.5 + m.rage * 4;
    }

    m.danger.material.opacity = 0.22 + m.rage * 0.35 + Math.sin(now / 250 + m.ph) * 0.05;

    const tt = tm / 1000;
    let idx = 0;
    m.tentacles.forEach((t) => {
      t.radii.forEach((rad, j) => {
        const u = j / (t.radii.length - 1);
        const ang = t.ang + m.yaw + Math.sin(tt * 2.2 + t.ph + j * 0.5) * 0.35 * u;
        const r = 0.2 + u * 0.42 + Math.sin(tt * 3 + t.ph + j * 0.7) * 0.05 * u;
        _v3.set(
          Math.sin(ang) * r,
          0.5 - u * 0.47 + Math.sin(tt * 4 + t.ph + j) * 0.05 * u + (m.core.position.y - 0.62),
          Math.cos(ang) * r
        );
        _m4.compose(_v3, _q0, _s3.setScalar(rad));
        m.tentIM.setMatrixAt(idx++, _m4);
      });
    });
    m.tentIM.instanceMatrix.needsUpdate = true;
  });

  if (screen === "play" && near <= 2 && !hiding && now - lastGrowl > 1700) {
    lastGrowl = now;
    SFX.growl();
  }

  const dOp = screen === "play" && !hiding && near <= 2 ? (near <= 1 ? "1" : "0.55") : "0";
  if (dOp !== lastDangerOp && dangerEl) {
    lastDangerOp = dOp;
    dangerEl.style.opacity = dOp;
  }

  // 8. 소나 핑 파동
  syncSonar(now, world, game, exitCellFn, radarBlips);

  // 9. 출구 포탈 회전 및 섬광
  const ex = world.exit;
  ex.disc.rotation.z -= s * 1.6;
  ex.ring.rotation.z += s * 0.3;
  const flare = Math.max(0, 1 - (now - ex.flareT) / 1600);
  shared.L.exit.intensity = 6 + Math.sin(now / 260) * 1.2 + flare * 30;
  ex.beam.material.opacity = 0.22 + flare * 0.7;
  ex.beam.scale.set(1 + flare * 0.6, 1 + flare * 1.5, 1 + flare * 0.6);

  if (Math.random() < dt / 40) {
    const e = world.exitPos, a3 = Math.random() * 6.28;
    fx.emit(e.x + Math.cos(a3) * 0.35, 0.1, e.z + Math.sin(a3) * 0.35, 0, 0.5 + Math.random() * 0.6, 0, 0x9fe8ff, 1.6, 0.1);
  }

  // 10. 가까운 횃불 조명 할당
  const pp = P.g.position;
  let t1 = null, d1 = 1e9, t2 = null, d2 = 1e9;
  for (const t of world.torches) {
    const d = Math.hypot(t.lightPos.x - pp.x, t.lightPos.z - pp.z);
    if (d < d1) {
      t2 = t1; d2 = d1; t1 = t; d1 = d;
    } else if (d < d2) {
      t2 = t; d2 = d;
    }
  }

  for (let k3 = 0; k3 < 2; k3++) {
    const l = shared.L.torch[k3], t = k3 ? t2 : t1, d = k3 ? d2 : d1;
    if (!t) {
      l.intensity = 0;
      continue;
    }
    const fl = 0.85 + Math.sin(now / 70 + t.ph) * 0.08 + Math.sin(now / 37 + t.ph * 2) * 0.07;
    l.position.copy(t.lightPos);
    l.intensity = 5 * fl * Math.max(0, Math.min(1, (10 - d) / 5));
  }

  for (const t of world.torches) {
    if (!t.flame) continue;
    const fl = 0.85 + Math.sin(now / 70 + t.ph) * 0.08 + Math.sin(now / 37 + t.ph * 2) * 0.07;
    if (t.glow) t.glow.scale.setScalar(0.8 + fl * 0.25);
    t.flame.scale.set(1, fl * 1.1, 1);
    if (Math.random() < dt / 120) {
      const p = t.flame.getWorldPosition(world.tA);
      fx.emit(p.x, p.y + 0.08, p.z, (Math.random() - 0.5) * 0.1, 0.4, (Math.random() - 0.5) * 0.1, 0xff9a40, 0.8, 0.2);
    }
  }

  // 11. 먼지 파티클 부유
  const dp = shared.dust.geometry.attributes.position;
  const box = shared.dust.userData.box;
  const sd = shared.dust.userData.seed;
  for (let i = 0; i < sd.length; i++) {
    const [u, v, w, ph] = sd[i];
    dp.setXYZ(
      i,
      (u - 0.5) * box[0] + Math.sin(now / 4000 + ph) * 0.4,
      0.2 + ((v + now / 60000) % 1) * box[1],
      (w - 0.5) * box[2] + Math.cos(now / 5000 + ph) * 0.4
    );
  }
  dp.needsUpdate = true;

  fx.update(dt);
  updateCamera(now, dt, world, screen, glCanvas);
}

function syncSonar(now, world, game, exitCellFn, radarBlips) {
  if (!sonarColor) sonarColor = new THREE.Color();
  const pg = game.ping, maxR = world.span * 1.3 + 2;
  const r = pg ? ((now - pg.t0) / 1000) * SONAR_SPEED : 1e9;
  const live = pg && r < maxR + 3;

  for (let q = 0; q < 2; q++) {
    const ring = q ? world.sonarRing2 : world.sonarRing, op = q ? 0.45 : 0.9;
    ring.visible = !!(pg && r < maxR);
    if (ring.visible) {
      ring.position.x = pg.origin.x;
      ring.position.z = pg.origin.z;
      ring.scale.setScalar(Math.max(0.01, r));
      ring.material.opacity = op * (1 - r / maxR);
    }
  }

  if (live || world.glowLive) {
    const gc = world.glowCaps, c = sonarColor;
    world.wallPos.forEach((p, i) => {
      let v = 0;
      if (live) {
        const d = Math.hypot(p.x - pg.origin.x, p.z - pg.origin.z);
        const front = Math.exp(-((d - r) ** 2) / 0.35);
        const trail = d < r ? 0.35 * Math.exp(-(r - d) / 1.6) : 0;
        v = Math.max(front, trail) * Math.max(0, 1 - (d / maxR) * 0.6);
      }
      gc.setColorAt(i, c.setRGB(0.22 * v, 0.6 * v, 0.8 * v));
    });
    gc.instanceColor.needsUpdate = true;
    world.glowLive = !!live;
  }

  if (!pg) return;

  const e = world.exitPos, dE = Math.hypot(e.x - pg.origin.x, e.z - pg.origin.z);
  if (!pg.echoed && r >= dE) {
    pg.echoed = true;
    world.exit.flareT = now;
    const near = 1 - Math.min(1, dE / world.span);
    setTimeout(() => SFX.echo(Math.max(-1, Math.min(1, (e.x - pg.origin.x) / 5)), near), 120);
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * 6.28;
      fx.emit(e.x, 0.6, e.z, Math.cos(a) * 1.5, 1.5 + Math.random() * 2, Math.sin(a) * 1.5, 0x8fdcff, 1.4, -1);
    }
    if (radarBlips && exitCellFn) {
      radarBlips.push({ kind: "exit", cell: exitCellFn(), t: now, strong: true });
    }
  }

  game.guards.forEach((gd, i) => {
    if (pg.hitMon.has(i)) return;
    const m = world.monsters[i].g.position;
    if (r >= Math.hypot(m.x - pg.origin.x, m.z - pg.origin.z)) {
      pg.hitMon.add(i);
      for (let k = 0; k < 24; k++) {
        const a = Math.random() * 6.28;
        fx.emit(m.x, 0.7, m.z, Math.cos(a) * 1.2, 0.8 + Math.random(), Math.sin(a) * 1.2, 0xff3020, 1.0, -1);
      }
      if (radarBlips) {
        radarBlips.push({ kind: "mon", cell: [...gd.path[gd.i]], t: now, strong: true });
      }
    }
  });
}
