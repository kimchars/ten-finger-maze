// 던전 맵 3D 지형 인스턴싱, 테마별 소품, 환경 조명 동기화 및 메모리 해제
import { THREE, scene, cam, renderer, shared, mergeGeos, rng } from "./engine.js";
import { THEMES, DEFAULT_MON, FCOL, FINGER } from "../config.js";
import {
  makePlayer,
  makeMonster,
  makeDoor,
  makeExit,
  makeTorch,
  makeBats,
  makeBrick,
  label,
} from "./entities.js";

export let world = null;

export function isDoorCh(game, ch) {
  return !!(game && game.s.doors[ch]);
}

// 가위바위보 철창: P2가 수문장과 가위바위보를 해서 이겨야 열려요
export function isRpsCh(game, ch) {
  return !!(game && game.s.rps && game.s.rps[ch]);
}

// 벽돌 벽: 정해진 손가락을 N번 접었다 펴면 부서져요
export function isBrick(game, ch) {
  return !!(game && game.s.bricks && game.s.bricks[ch]);
}

export function isBridge(game, ch) {
  return !!(game && game.s.bridges && game.s.bridges[ch]);
}

export function doorNeeds(game, ch) {
  return game.s.doors[ch] || [];
}

export function bridgeNeeds(game, ch) {
  return (game.s.bridges && game.s.bridges[ch]) || [];
}

export function disposeTree(o) {
  o.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    const ms = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
    ms.forEach((m) => {
      if (m.userData.shared) return;
      if (m.map && !m.map.userData.shared) m.map.dispose();
      m.dispose();
    });
  });
}

export function buildProps(kind, ctx) {
  const { root, map, W, R, wallCells, wallH, floorCells, liquidCells, torches } = ctx;
  const out = { sparkles: [], sparkleColor: 0xffffff };
  const add = (geos, mat, shadow = true) => {
    if (!geos.length) return;
    const m = new THREE.Mesh(mergeGeos(geos), mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    root.add(m);
  };
  const isFloor = (r, c) => {
    const ch = map[r]?.[c];
    return ch !== undefined && ch !== "#" && ch !== "~";
  };
  const wallSides = (r, c) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dr, dc]) => map[r + dr]?.[c + dc] === "#");
  const plain = (r, c) => map[r][c] === ".";

  if (kind === "stalag" || kind === "lava") {
    const rock = new THREE.MeshStandardMaterial(
      kind === "lava"
        ? { color: 0x1a1414, roughness: 0.25, metalness: 0.4 }
        : { color: 0x7a7266, roughness: 0.95 }
    );
    const geos = [];
    wallCells.forEach(([r, c], i) => {
      if (R() > (kind === "lava" ? 0.22 : 0.3)) return;
      const p = W(r, c), n = 1 + Math.floor(R() * 2);
      for (let k = 0; k < n; k++) {
        const h = 0.18 + R() * 0.32, rad = 0.05 + R() * 0.07;
        geos.push(
          new THREE.ConeGeometry(rad, h, 6).translate(
            p.x + (R() - 0.5) * 0.5,
            wallH[i] + 0.08 + h / 2,
            p.z + (R() - 0.5) * 0.5
          )
        );
      }
    });
    floorCells.forEach(([r, c]) => {
      const ws = wallSides(r, c);
      if (!ws.length || R() > 0.18 || !plain(r, c)) return;
      const [dr, dc] = ws[Math.floor(R() * ws.length)], p = W(r, c);
      geos.push(
        new THREE.DodecahedronGeometry(0.04 + R() * 0.05, 0).translate(
          p.x + dc * 0.36 + (R() - 0.5) * 0.3 * Math.abs(dr),
          0.05,
          p.z + dr * 0.36 + (R() - 0.5) * 0.3 * Math.abs(dc)
        )
      );
    });
    add(geos, rock);

    if (kind === "lava") {
      const crackM = new THREE.MeshStandardMaterial({
        color: 0x200400,
        emissive: 0xff5a10,
        emissiveIntensity: 1.8,
      });
      const cracks = [];
      floorCells.forEach(([r, c]) => {
        if (R() > 0.3 || !plain(r, c)) return;
        const p = W(r, c);
        for (let k = 0; k < 2; k++) {
          cracks.push(
            new THREE.PlaneGeometry(0.35 + R() * 0.35, 0.025)
              .rotateX(-Math.PI / 2)
              .rotateY(R() * Math.PI)
              .translate(p.x + (R() - 0.5) * 0.4, 0.024, p.z + (R() - 0.5) * 0.4)
          );
        }
      });
      add(cracks, crackM, false);

      liquidCells.forEach(([r, c]) => {
        if (torches.length >= 5 || map[r][c] !== "~") return;
        if (torches.some((t) => Math.abs(t.r - r) + Math.abs(t.c - c) < 5)) return;
        if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => isFloor(r + dr, c + dc))) return;
        const p = W(r, c);
        torches.push({
          r,
          c,
          ph: R() * 10,
          lightPos: new THREE.Vector3(p.x, 0.45, p.z),
          flame: null,
          glow: null,
        });
      });
      out.sparkleColor = 0xff8a2a;
    }
  }

  if (kind === "mushroom") {
    const stemM = new THREE.MeshStandardMaterial({ color: 0xd8e6d0, roughness: 0.8 });
    const capA = new THREE.MeshStandardMaterial({
      color: 0x20302a,
      emissive: 0x40ffd0,
      emissiveIntensity: 1.1,
    });
    const capB = new THREE.MeshStandardMaterial({
      color: 0x202a30,
      emissive: 0x60a8ff,
      emissiveIntensity: 1.1,
    });
    const stems = [], caps = [[], []];
    const shroom = (x, y, z, s) => {
      const h = (0.08 + R() * 0.07) * s;
      stems.push(new THREE.CylinderGeometry(0.012 * s, 0.018 * s, h, 5).translate(x, y + h / 2, z));
      caps[R() < 0.6 ? 0 : 1].push(
        new THREE.SphereGeometry((0.04 + R() * 0.03) * s, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(
          x,
          y + h,
          z
        )
      );
      out.sparkles.push([x, y + h, z]);
    };
    floorCells.forEach(([r, c]) => {
      const ws = wallSides(r, c);
      if (!ws.length || R() > 0.32 || !plain(r, c)) return;
      const [dr, dc] = ws[Math.floor(R() * ws.length)], p = W(r, c), n = 1 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        shroom(
          p.x + dc * 0.36 + (R() - 0.5) * 0.4 * Math.abs(dr),
          0.03,
          p.z + dr * 0.36 + (R() - 0.5) * 0.4 * Math.abs(dc),
          1
        );
      }
    });
    wallCells.forEach(([r, c], i) => {
      if (R() > 0.12) return;
      const p = W(r, c);
      shroom(p.x + (R() - 0.5) * 0.5, wallH[i] + 0.08, p.z + (R() - 0.5) * 0.5, 1.4);
    });
    add(stems, stemM);
    add(caps[0], capA, false);
    add(caps[1], capB, false);
    out.sparkleColor = 0x7dffd8;
  }

  if (kind === "mine") {
    const wood = new THREE.MeshStandardMaterial({
      map: shared.plankTex,
      color: 0xb08a68,
      roughness: 0.85,
    });
    const woods = [], rails = [];
    floorCells.forEach(([r, c]) => {
      if (!plain(r, c)) return;
      const lr = map[r][c - 1] === "#" && map[r][c + 1] === "#";
      const ud = map[r - 1]?.[c] === "#" && map[r + 1]?.[c] === "#";
      const p = W(r, c);
      if ((lr || ud) && R() < 0.33) {
        const rot = lr ? 0 : Math.PI / 2;
        const parts = [
          new THREE.BoxGeometry(0.08, 0.95, 0.08).translate(-0.44, 0.47, 0),
          new THREE.BoxGeometry(0.08, 0.95, 0.08).translate(0.44, 0.47, 0),
          new THREE.BoxGeometry(1.0, 0.08, 0.1).translate(0, 0.95, 0),
        ];
        parts.forEach((g2) => woods.push(g2.rotateY(rot).translate(p.x, 0, p.z)));
        if (
          torches.length < 6 &&
          R() < 0.6 &&
          !torches.some((t) => Math.abs(t.r - r) + Math.abs(t.c - c) < 5)
        ) {
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.07), shared.flameM);
          lamp.position.set(p.x, 0.82, p.z);
          root.add(lamp);
          const glow = new THREE.Sprite(shared.torchGlowM);
          glow.position.set(p.x, 0.82, p.z);
          glow.scale.setScalar(0.8);
          root.add(glow);
          torches.push({
            r,
            c,
            ph: R() * 10,
            lightPos: new THREE.Vector3(p.x, 0.75, p.z),
            flame: lamp,
            glow,
          });
        }
      }
      if ((lr || ud) && R() < 0.55) {
        const rot = lr ? 0 : Math.PI / 2;
        [-0.17, 0.17].forEach((x) =>
          rails.push(
            new THREE.BoxGeometry(0.035, 0.03, 1.0)
              .translate(x, 0.04, 0)
              .rotateY(rot)
              .translate(p.x, 0, p.z)
          )
        );
        [-0.33, 0, 0.33].forEach((z) =>
          woods.push(
            new THREE.BoxGeometry(0.5, 0.025, 0.08)
              .translate(0, 0.03, z)
              .rotateY(rot)
              .translate(p.x, 0, p.z)
          )
        );
      }
    });
    add(woods, wood);
    add(rails, shared.iron, false);
    out.sparkleColor = 0xd8b890;
  }

  if (kind === "crystal") {
    const cA = new THREE.MeshStandardMaterial({
      color: 0x6a40c0,
      emissive: 0xa060ff,
      emissiveIntensity: 1.5,
      roughness: 0.15,
      metalness: 0.1,
    });
    const cB = new THREE.MeshStandardMaterial({
      color: 0x3080a0,
      emissive: 0x60e0ff,
      emissiveIntensity: 1.5,
      roughness: 0.15,
      metalness: 0.1,
    });
    const lists = [[], []];
    const crystal = (x, y, z, s) => {
      const h = (0.12 + R() * 0.1) * s;
      lists[R() < 0.55 ? 0 : 1].push(
        new THREE.OctahedronGeometry(0.06 * s + R() * 0.03, 0)
          .scale(1, 2.6 + R() * 1.4, 1)
          .rotateX((R() - 0.5) * 0.4)
          .rotateZ((R() - 0.5) * 0.4)
          .translate(x, y + h * 0.6, z)
      );
      out.sparkles.push([x, y + h, z]);
    };
    wallCells.forEach(([r, c], i) => {
      if (R() > 0.3) return;
      const p = W(r, c), n = 2 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        crystal(p.x + (R() - 0.5) * 0.35, wallH[i] + 0.06, p.z + (R() - 0.5) * 0.35, 1.5);
      }
    });
    floorCells.forEach(([r, c]) => {
      const ws = wallSides(r, c);
      if (!ws.length || R() > 0.12 || !plain(r, c)) return;
      const [dr, dc] = ws[Math.floor(R() * ws.length)], p = W(r, c);
      crystal(p.x + dc * 0.37, 0.03, p.z + dr * 0.37, 0.8);
    });
    add(lists[0], cA, false);
    add(lists[1], cB, false);
    out.sparkleColor = 0xd8c8ff;
  }
  return out;
}

export function buildWorld(game, si) {
  if (world) {
    scene.remove(world.root);
    disposeTree(world.root);
  }

  const st = game.s, map = game.map, rows = game.rows, cols = game.cols;
  const R = rng(si * 31 + 5);
  const root = new THREE.Group();
  scene.add(root);

  const W = (r, c) => new THREE.Vector3(c - cols / 2 + 0.5, 0, r - rows / 2 + 0.5);
  const Wto = (out, r, c) => out.set(c - cols / 2 + 0.5, 0, r - rows / 2 + 0.5);

  const TH = THEMES[st.theme] || THEMES.cave;
  shared.wallMat.color.set(TH.wall);
  shared.capMat.color.set(TH.cap);
  shared.tileMat.color.set(TH.tile);
  scene.fog.color.set(TH.fog);
  scene.background.set(TH.fog);
  shared.hemi.color.set(TH.sky);
  shared.hemi.groundColor.set(TH.ground);
  shared.hemi.intensity = TH.hemi;
  shared.moon.color.set(TH.moon);
  shared.moon.intensity = TH.moonI;

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x0a0b10, roughness: 1 })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.02;
  base.receiveShadow = true;
  root.add(base);

  const floorCells = [], wallCells = [], liquidCells = [];
  map.forEach((row, r) =>
    [...row].forEach((ch, c) =>
      (ch === "#" ? wallCells : ch === "~" || isBridge(game, ch) ? liquidCells : floorCells).push([
        r,
        c,
      ])
    )
  );

  const tiles = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.95, 0.06, 0.95),
    shared.tileMat,
    floorCells.length
  );
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  floorCells.forEach(([r, c], i) => {
    const p = W(r, c);
    p.y = -0.01 + R() * 0.008;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.floor(R() * 4) * Math.PI) / 2);
    m4.compose(p, q, new THREE.Vector3(1, 1, 1));
    tiles.setMatrixAt(i, m4);
    tiles.setColorAt(i, col.setHSL(0, 0, 0.6 + R() * 0.3));
  });
  tiles.receiveShadow = true;
  root.add(tiles);

  const walls = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    shared.wallMat,
    wallCells.length
  );
  const caps = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.02, 0.08, 1.02),
    shared.capMat,
    wallCells.length
  );
  const wallH = [];
  wallCells.forEach(([r, c], i) => {
    const p = W(r, c), h = 0.66 + R() * 0.16;
    wallH.push(h);
    m4.compose(p, new THREE.Quaternion(), new THREE.Vector3(1, h, 1));
    walls.setMatrixAt(i, m4);
    walls.setColorAt(i, col.setHSL(0, 0, 0.62 + R() * 0.3));

    m4.compose(new THREE.Vector3(p.x, h + 0.04, p.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    caps.setMatrixAt(i, m4);
    caps.setColorAt(i, col.setHSL(0, 0, 0.6 + R() * 0.35));
  });
  walls.castShadow = true;
  walls.receiveShadow = true;
  root.add(walls);

  // 소나 핑 벽 윗면 발광 메쉬
  const glowCaps = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    wallCells.length
  );
  const wallPos = [];
  wallCells.forEach(([r, c], i) => {
    const p = W(r, c);
    wallPos.push(p);
    m4.compose(
      new THREE.Vector3(p.x, 0.93, p.z),
      new THREE.Quaternion(),
      new THREE.Vector3(0.98, 1, 0.98)
    );
    glowCaps.setMatrixAt(i, m4);
    glowCaps.setColorAt(i, col.setRGB(0, 0, 0));
  });
  glowCaps.renderOrder = 5;
  root.add(glowCaps);

  const sonarRing = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x8fdcff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  sonarRing.position.y = 0.06;
  sonarRing.visible = false;
  root.add(sonarRing);

  const sonarRing2 = new THREE.Mesh(
    new THREE.RingGeometry(0.97, 1, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x8fdcff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  sonarRing2.position.y = 0.98;
  sonarRing2.visible = false;
  root.add(sonarRing2);
  caps.castShadow = true;
  caps.receiveShadow = true;
  root.add(caps);

  // 액체 평면 (물 / 용암)
  let liquid = null;
  if (liquidCells.length) {
    const lava = st.liquid === "lava";
    const tex = lava ? shared.lavaTex : shared.waterTex;
    const mat = new THREE.MeshStandardMaterial(
      lava
        ? {
            color: 0x2a0800,
            emissive: 0xffffff,
            emissiveMap: tex,
            emissiveIntensity: 1.6,
            roughness: 0.9,
          }
        : {
            color: 0x6aa8d8,
            map: tex,
            emissive: 0x0b3a66,
            emissiveIntensity: 0.7,
            roughness: 0.12,
            metalness: 0.2,
          }
    );
    const geos = liquidCells.map(([r, c]) => {
      const p = W(r, c);
      return new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(p.x, -0.004, p.z);
    });
    liquid = new THREE.Mesh(mergeGeos(geos), mat);
    liquid.receiveShadow = !lava;
    root.add(liquid);
    liquid.userData.lava = lava;
  }

  // 벽돌 벽
  const bricks = [];
  map.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (!isBrick(game, ch)) return;
      const cfg = game.s.bricks[ch], p = W(r, c);
      const b = makeBrick(cfg.hits, FCOL[cfg.finger]);
      b.g.position.copy(p);
      root.add(b.g);
      const lb = label([{ t: FINGER[cfg.finger], color: FCOL[cfg.finger] }, { t: ` ×${cfg.hits}`, color: "#ffffff" }], 0.24);
      lb.position.set(p.x, 1.45, p.z);
      root.add(lb);
      bricks.push({ ...b, ch, lb, pos: p.clone(), shown: cfg.hits, flashT: -1e9 });
    })
  );

  // 다리
  const bridges = [];
  map.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (!isBridge(game, ch)) return;
      const need = bridgeNeeds(game, ch), f = need[0], p = W(r, c);
      const g = new THREE.Group();
      g.position.copy(p);
      root.add(g);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.9), shared.slabMat);
      slab.position.y = 0.0;
      slab.castShadow = true;
      slab.receiveShadow = true;
      g.add(slab);

      const em = new THREE.MeshStandardMaterial({
        color: FCOL[f],
        emissive: FCOL[f],
        emissiveIntensity: 1.8,
        roughness: 0.4,
      });
      const edge = new THREE.Mesh(
        mergeGeos([
          new THREE.BoxGeometry(0.92, 0.04, 0.06).translate(0, 0.04, 0.43),
          new THREE.BoxGeometry(0.92, 0.04, 0.06).translate(0, 0.04, -0.43),
          new THREE.BoxGeometry(0.06, 0.04, 0.92).translate(0.43, 0.04, 0),
          new THREE.BoxGeometry(0.06, 0.04, 0.92).translate(-0.43, 0.04, 0),
        ]),
        em
      );
      g.add(edge);

      const lb = label([{ t: FINGER[f], color: FCOL[f] }], 0.2);
      lb.position.set(p.x, 0.75, p.z);
      root.add(lb);
      bridges.push({ g, ch, em, lb, o: 0 });
    })
  );

  // 철창
  // 철창 방향: 출발점에서 걸어올 때 들어오는 방향을 보고 정해요.
  // 왼쪽/오른쪽에서 들어오면 문은 위아래 벽에 붙도록 세로로, 위/아래에서 들어오면 좌우 벽에 붙도록 가로로 세워요.
  // (예전에는 '좌우가 둘 다 벽인가'만 봐서 모퉁이·갈림길에 있는 철창이 엉뚱한 방향으로 서 있었어요)
  const enterDir = {};
  {
    let sr = -1, sc = -1;
    map.forEach((row, r) => { const i = row.indexOf("S"); if (i >= 0) { sr = r; sc = i; } });
    if (sr >= 0) {
      const seen = new Set([sr + "," + sc]), q = [[sr, sc]];
      while (q.length) {
        const [r, c] = q.shift();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr, nc = c + dc, ch = (map[nr] || "")[nc];
          if (ch === undefined || ch === "#" || ch === "~" || seen.has(nr + "," + nc)) continue;
          seen.add(nr + "," + nc);
          if ((isDoorCh(game, ch) || isRpsCh(game, ch)) && !enterDir[nr + "," + nc]) enterDir[nr + "," + nc] = dc !== 0 ? "h" : "v";
          q.push([nr, nc]);
        }
      }
    }
  }
  const doors = {};
  map.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (!isDoorCh(game, ch) && !isRpsCh(game, ch)) return;
      const ent = enterDir[r + "," + c];
      // acrossX=true: 좌우로 가로막는 문(위아래로 지나감) / false: 위아래로 세운 문(좌우로 지나감)
      const acrossX = ent ? ent === "v" : map[r][c - 1] === "#" && map[r][c + 1] === "#";
      const d = makeDoor(isRpsCh(game, ch) ? "rps" : doorNeeds(game, ch), acrossX);
      d.g.position.copy(W(r, c));
      root.add(d.g);
      doors[r + "," + c] = { ...d, ch };
    })
  );

  // 철창 라벨
  const labeled = new Set();
  Object.values(doors).forEach((d) => {
    if (labeled.has(d.ch)) return;
    const cells = Object.values(doors).filter((x) => x.ch === d.ch);
    labeled.add(d.ch);
    const center = cells
      .reduce((a, x) => a.add(x.g.position), new THREE.Vector3())
      .multiplyScalar(1 / cells.length);
    const needs = doorNeeds(game, d.ch), parts = [];
    if (isRpsCh(game, d.ch)) parts.push({ t: "가위바위보", color: "#ffd34d" });
    else needs.forEach((f, i) => {
      if (i) parts.push({ t: "+", color: "#ffffff" });
      parts.push({ t: FINGER[f], color: FCOL[f] });
    });
    const s = label(parts, 0.26);
    s.position.set(center.x, 1.4, center.z);
    root.add(s);
    cells.forEach((x) => (x.label = s));
  });

  // 출구
  let exitPos = new THREE.Vector3();
  map.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === "E") exitPos = W(r, c);
    })
  );
  const exit = makeExit();
  exit.g.position.copy(exitPos);
  root.add(exit.g);

  const exLabel = label([{ t: "출구", color: "#bfefff" }], 0.28);
  exLabel.position.set(exitPos.x, 1.45, exitPos.z);
  root.add(exLabel);

  // 출발 표시
  const sp = W(...game.start);
  const startMark = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.34, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd2a0, transparent: true, opacity: 0.35 })
  );
  startMark.rotation.x = -Math.PI / 2;
  startMark.position.set(sp.x, 0.03, sp.z);
  root.add(startMark);

  // 횃불
  const cand = [];
  wallCells.forEach(([r, c]) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
      const ch = map[r + dr]?.[c + dc];
      if (ch === "." && dr !== -1) cand.push([r, c, dr, dc]);
    })
  );
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [cand[i], cand[j]] = [cand[j], cand[i]];
  }
  const torches = [],
    maxT = TH.torches ? Math.min(5, Math.max(2, Math.round(floorCells.length / 18))) : 0;
  for (const [r, c, dr, dc] of cand) {
    if (torches.length >= maxT) break;
    if (torches.some((t) => Math.abs(t.r - r) + Math.abs(t.c - c) < 6)) continue;
    const t = makeTorch(), p = W(r, c);
    t.g.position.set(p.x + dc * 0.5, 0, p.z + dr * 0.5);
    t.g.rotation.y = Math.atan2(dc, dr);
    root.add(t.g);
    t.r = r;
    t.c = c;
    t.lightPos = new THREE.Vector3(p.x + dc * 0.7, 0.85, p.z + dr * 0.7);
    torches.push(t);
  }

  const extra = buildProps(TH.props, {
    root,
    map,
    W,
    R,
    wallCells,
    wallH,
    floorCells,
    liquidCells,
    torches,
  });

  shared.L.exit.position.set(exitPos.x, 0.7, exitPos.z);
  shared.L.mon.forEach((l) => (l.intensity = 0));
  shared.L.torch.forEach((l) => (l.intensity = 0));

  const player = makePlayer();
  root.add(player.g);

  const monsters = game.guards.map((gd, k) => {
    const m = makeMonster(si * 10 + k + 1, TH.mon || DEFAULT_MON);
    root.add(m.g);
    // 감지 범위: 걸음 수 기준이라 마름모 모양 (가장자리만 진하게)
    if (game.s.sense && (!game.s.senseOnly || game.s.senseOnly.includes(k))) {
      const r = game.s.sense + 0.5;
      m.sense = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.12, r, 4, 1),
        new THREE.MeshBasicMaterial({ color: 0xff3a24, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
      );
      m.sense.rotation.x = -Math.PI / 2;
      root.add(m.sense);
    }
    return m;
  });

  const bats = game.bats.map(() => {
    const b = makeBats();
    root.add(b.im);
    return b;
  });

  const span = Math.max(cols, rows);
  const moon = shared.moon;
  moon.shadow.camera.left = moon.shadow.camera.bottom = -span * 0.8 - 2;
  moon.shadow.camera.right = moon.shadow.camera.top = span * 0.8 + 2;
  moon.shadow.camera.far = 60;
  moon.shadow.camera.updateProjectionMatrix();

  const dp = shared.dust.geometry.attributes.position;
  shared.dust.userData.box = [cols + 2, 2.2, rows + 2];
  sonarRing.visible = sonarRing2.visible = true;
  renderer.compile(scene, cam);
  sonarRing.visible = sonarRing2.visible = false;

  world = {
    root,
    W,
    doors,
    exit,
    exitPos,
    torches,
    player,
    monsters,
    span,
    cols,
    rows,
    glowCaps,
    wallPos,
    sonarRing,
    sonarRing2,
    glowLive: false,
    liquid,
    liquidCells,
    bridges,
    bricks,
    bats,
    Wto,
    doorList: Object.values(doors),
    tA: new THREE.Vector3(),
    tB: new THREE.Vector3(),
    nearT: [null, null],
    sparkles: extra.sparkles,
    sparkleColor: extra.sparkleColor,
  };
  dp.needsUpdate = true;
  return world;
}
