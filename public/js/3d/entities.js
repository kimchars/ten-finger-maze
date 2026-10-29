// 3D 엔티티 생성: 플레이어, 괴물, 철창, 출구 포탈, 횃불, 박쥐 떼, 라벨 스프라이트
import { THREE, shared, mergeGeos, rng } from "./engine.js";
import { FINGER, FCOL, DEFAULT_MON } from "../config.js";

export function label(parts, h = 0.32) {
  const fs = 72, pad = 18;
  const c = document.createElement("canvas"), g = c.getContext("2d");
  g.font = `900 ${fs}px "Noto Sans KR", sans-serif`;
  const widths = parts.map((p) => g.measureText(p.t).width);
  c.width = Math.ceil(widths.reduce((a, b) => a + b, 0) + pad * 2);
  c.height = fs + pad * 2;
  g.font = `900 ${fs}px "Noto Sans KR", sans-serif`;
  g.textBaseline = "middle";
  let x = pad;
  parts.forEach((p, i) => {
    g.lineWidth = 12;
    g.strokeStyle = "rgba(0,0,0,0.75)";
    g.strokeText(p.t, x, c.height / 2 + 4);
    g.fillStyle = p.color;
    g.fillText(p.t, x, c.height / 2 + 4);
    x += widths[i];
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true });
  const s = new THREE.Sprite(m);
  s.renderOrder = 10;
  s.scale.set((h * c.width) / c.height, h, 1);
  return s;
}

export function makePlayer() {
  const g = new THREE.Group(), rig = new THREE.Group();
  g.add(rig);

  const cloth = new THREE.MeshStandardMaterial({ color: 0x2c5f99, roughness: 0.75 });
  const cloth2 = new THREE.MeshStandardMaterial({ color: 0x1f456f, roughness: 0.8 });
  const face = new THREE.MeshStandardMaterial({ color: 0x0c121c, roughness: 0.35 });
  const scarf = new THREE.MeshStandardMaterial({ color: 0xffc98a, roughness: 0.85 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.8 });
  const eyeM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xcfeaff, emissiveIntensity: 3 });

  const M = (geo, mat, x = 0, y = 0, z = 0, parent = rig) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  M(new THREE.CapsuleGeometry(0.15, 0.16, 6, 14), cloth, 0, 0.4, 0);
  const cloak = M(new THREE.ConeGeometry(0.22, 0.34, 16, 1, true), cloth2, 0, 0.33, 0);
  cloak.material.side = THREE.DoubleSide;
  M(new THREE.SphereGeometry(0.175, 24, 18), cloth, 0, 0.68, -0.01);
  M(new THREE.SphereGeometry(0.135, 24, 18), face, 0, 0.665, 0.06);

  const eyes = [
    M(new THREE.SphereGeometry(0.024, 10, 8), eyeM, -0.05, 0.68, 0.183),
    M(new THREE.SphereGeometry(0.024, 10, 8), eyeM, 0.05, 0.68, 0.183),
  ];

  const tip = M(new THREE.ConeGeometry(0.07, 0.16, 12), cloth, 0, 0.84, -0.09);
  tip.rotation.x = -0.9;
  const sc = M(new THREE.TorusGeometry(0.13, 0.04, 8, 22), scarf, 0, 0.53, 0);
  sc.rotation.x = Math.PI / 2;

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0.07, 0.53, -0.11);
  rig.add(tailPivot);
  const tail = M(new THREE.BoxGeometry(0.07, 0.2, 0.025), scarf, 0, -0.09, 0, tailPivot);

  M(new THREE.BoxGeometry(0.22, 0.24, 0.11), leather, 0, 0.44, -0.16);
  M(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 10), cloth2, 0, 0.6, -0.2).rotation.z = Math.PI / 2;

  const limb = (x, y, r, l, mat) => {
    const p = new THREE.Group();
    p.position.set(x, y, 0);
    rig.add(p);
    M(new THREE.CapsuleGeometry(r, l, 4, 10), mat, 0, -l / 2 - r * 0.6, 0, p);
    return p;
  };
  const legL = limb(-0.07, 0.2, 0.05, 0.1, cloth2);
  const legR = limb(0.07, 0.2, 0.05, 0.1, cloth2);
  const armL = limb(-0.18, 0.5, 0.042, 0.13, cloth);
  const armR = limb(0.18, 0.5, 0.042, 0.13, cloth);

  // 랜턴
  const lan = new THREE.Group();
  lan.position.set(0.02, -0.25, 0.04);
  armR.add(lan);
  M(new THREE.CylinderGeometry(0.045, 0.055, 0.1, 8), shared.iron, 0, 0, 0, lan);

  const glowM = new THREE.MeshStandardMaterial({
    color: 0xffc070,
    emissive: 0xffa040,
    emissiveIntensity: 4,
  });
  const glow = M(new THREE.SphereGeometry(0.035, 12, 10), glowM, 0, 0.005, 0, lan);
  glow.castShadow = false;

  const lantern = new THREE.Object3D();
  lantern.position.set(0, 0.02, 0);
  lan.add(lantern);

  // 캐릭터 밑 그림자/헤일로
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 1.2),
    new THREE.MeshBasicMaterial({
      map: shared.ringTex,
      color: 0x7cc4ff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.035;
  g.add(halo);

  g.traverse((o) => {
    if (o.isMesh && o !== halo) o.receiveShadow = false;
  });

  return {
    g,
    rig,
    legL,
    legR,
    armL,
    armR,
    tailPivot,
    lantern,
    glowM,
    eyeM,
    eyes,
    halo,
    yaw: Math.PI,
    phase: 0,
    crouch: 0,
    lanternLevel: 1,
  };
}

export function makeMonster(seed, MC = DEFAULT_MON) {
  const R = rng(seed * 97 + 13);
  const g = new THREE.Group(), core = new THREE.Group();
  g.add(core);
  core.position.y = 0.62;

  const geo = new THREE.IcosahedronGeometry(0.34, 4);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n =
      1 +
      0.1 * Math.sin(v.x * 11 + seed) * Math.sin(v.y * 9) +
      0.07 * Math.sin(v.z * 14 + v.y * 6) +
      (v.y < -0.15 ? -0.06 : 0);
    v.multiplyScalar(n);
    v.y *= 0.88;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();

  const skin = new THREE.MeshStandardMaterial({
    color: MC.skin,
    roughness: 0.32,
    metalness: 0.15,
    emissive: MC.emissive,
    emissiveIntensity: 0.55,
  });

  const M = (geo2, mat, parent = core) => {
    const m = new THREE.Mesh(geo2, mat);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const body = M(geo, skin);

  const up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const place = (g2, pos, quat) =>
    g2.applyMatrix4(new THREE.Matrix4().compose(pos, quat || new THREE.Quaternion(), one));

  // 가시
  const spikeM = new THREE.MeshStandardMaterial({
    color: MC.spike,
    roughness: 0.4,
    metalness: 0.3,
    emissive: MC.spike,
    emissiveIntensity: MC === DEFAULT_MON ? 0 : 0.35,
  });
  const spikes = [];
  for (let i = 0; i < 14; i++) {
    const d = new THREE.Vector3(R() * 2 - 1, 0.25 + R() * 0.9, (R() * 2 - 1) * 0.9 - 0.25).normalize();
    spikes.push(
      place(
        new THREE.ConeGeometry(0.035 + R() * 0.03, 0.16 + R() * 0.16, 6),
        d.clone().multiplyScalar(0.3),
        new THREE.Quaternion().setFromUnitVectors(up, d)
      )
    );
  }
  M(mergeGeos(spikes), spikeM);

  // 눈 세 개
  const eyeM = new THREE.MeshStandardMaterial({
    color: 0xffe0d0,
    emissive: MC.eye,
    emissiveIntensity: 3.2,
  });
  const pupilM = new THREE.MeshBasicMaterial({ color: 0x050203 });
  const eyeGeos = [], pupilGeos = [];
  [
    [0, 0.07, 0.29, 0.075],
    [-0.16, 0.14, 0.24, 0.048],
    [0.15, 0.17, 0.24, 0.042],
  ].forEach(([x, y, z, r]) => {
    eyeGeos.push(place(new THREE.SphereGeometry(r, 16, 12), new THREE.Vector3(x, y, z)));
    pupilGeos.push(
      place(new THREE.BoxGeometry(r * 0.28, r * 1.5, 0.01), new THREE.Vector3(x, y, z + r * 0.98))
    );
  });
  M(mergeGeos(eyeGeos), eyeM).castShadow = false;
  M(mergeGeos(pupilGeos), pupilM).castShadow = false;

  // 이빨
  const toothM = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.5 });
  const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  const teeth = [];
  for (let i = 0; i < 9; i++) {
    const a = -0.75 + i * (1.5 / 8);
    teeth.push(
      place(
        new THREE.ConeGeometry(0.02, 0.08 + (i % 2) * 0.03, 5),
        new THREE.Vector3(Math.sin(a) * 0.25, -0.08, Math.cos(a) * 0.25),
        flip
      )
    );
  }
  M(mergeGeos(teeth), toothM).castShadow = false;

  // 촉수 인스턴싱 (7개 촉수 x 8마디 = 56개 구체)
  const tentM = new THREE.MeshStandardMaterial({
    color: MC.tent,
    roughness: 0.4,
    emissive: MC.emissive,
    emissiveIntensity: 0.4,
  });
  const tentacles = [];
  for (let k = 0; k < 7; k++) {
    const ang = (k / 7) * Math.PI * 2 + R() * 0.3, radii = [];
    for (let s2 = 0; s2 < 8; s2++) radii.push(0.075 - s2 * 0.0075);
    tentacles.push({ ang, radii, ph: R() * 6.28 });
  }
  const tentIM = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), tentM, 56);
  tentIM.castShadow = true;
  tentIM.frustumCulled = false;
  g.add(tentIM);

  const danger = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2),
    new THREE.MeshBasicMaterial({
      map: shared.ringTex,
      color: 0xff2a1a,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  danger.rotation.x = -Math.PI / 2;
  danger.position.y = 0.04;
  danger.material.color.set(MC.light);
  g.add(danger);

  return {
    g,
    core,
    body,
    eyeM,
    tentacles,
    tentIM,
    danger,
    MC,
    yaw: 0,
    ph: R() * 6.28,
    rage: 0,
  };
}

export function makeDoor(needs, acrossX) {
  const g = new THREE.Group();
  const rps = needs === "rps"; // 가위바위보 철창은 금색
  if (rps) needs = [];
  const RPS_COL = 0xffc93a;
  const at = (geo, x, y) => geo.translate(x, y, 0);

  const frame = new THREE.Mesh(
    mergeGeos([
      at(new THREE.BoxGeometry(0.12, 1.05, 0.16), -0.47, 0.52),
      at(new THREE.BoxGeometry(0.12, 1.05, 0.16), 0.47, 0.52),
      at(new THREE.BoxGeometry(1.06, 0.12, 0.18), 0, 1.05),
    ]),
    shared.iron
  );
  frame.castShadow = true;
  frame.receiveShadow = true;
  g.add(frame);

  const bars = new THREE.Group();
  g.add(bars);

  const mats = (rps ? [RPS_COL] : needs.map((f) => FCOL[f])).map(
    (col) =>
      new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 2.2,
        roughness: 0.3,
        metalness: 0.4,
      })
  );
  const parts = mats.map(() => []);
  const nb = 7;
  for (let i = 0; i < nb; i++) {
    const x = -0.39 + i * (0.78 / (nb - 1)), k = i % mats.length;
    parts[k].push(
      at(new THREE.CylinderGeometry(0.045, 0.045, 0.95, 8), x, 0.5),
      at(new THREE.ConeGeometry(0.045, 0.1, 6), x, 1.0)
    );
  }
  [0.25, 0.75].forEach((y, k) =>
    parts[k % mats.length].push(at(new THREE.BoxGeometry(0.84, 0.05, 0.05), 0, y))
  );
  parts.forEach((list, k) => {
    const m = new THREE.Mesh(mergeGeos(list), mats[k]);
    m.castShadow = true;
    bars.add(m);
  });

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.7),
    new THREE.MeshBasicMaterial({
      map: shared.ringTex,
      color: rps ? RPS_COL : FCOL[needs[0]],
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.04;
  g.add(glow);

  if (!acrossX) g.rotation.y = Math.PI / 2;
  return { g, bars, mats, glow, o: 0 };
}

export function makeExit() {
  const g = new THREE.Group();
  const ringM = new THREE.MeshStandardMaterial({
    color: 0xdff6ff,
    emissive: 0x8fdcff,
    emissiveIntensity: 2.6,
    roughness: 0.2,
    metalness: 0.3,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 14, 48), ringM);
  ring.position.y = 0.6;
  g.add(ring);

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.33, 48),
    new THREE.MeshBasicMaterial({
      map: shared.swirlTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );
  disc.position.y = 0.6;
  g.add(disc);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.5, 4, 32, 1, true),
    new THREE.MeshBasicMaterial({
      map: shared.beamTex,
      color: 0x8fdcff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );
  beam.position.y = 2;
  g.add(beam);

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 1.4),
    new THREE.MeshBasicMaterial({
      map: shared.ringTex,
      color: 0x8fdcff,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.04;
  g.add(base);

  return { g, ring, disc, beam, flareT: -1e9 };
}

export function makeTorch() {
  const g = new THREE.Group();
  const br = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.06), shared.iron);
  br.position.set(0, 0.55, -0.04);
  br.rotation.x = 0.4;
  g.add(br);

  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.04, 0.08, 8), shared.iron);
  cup.position.set(0, 0.67, 0.02);
  g.add(cup);

  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 10), shared.flameM);
  flame.position.set(0, 0.8, 0.02);
  g.add(flame);

  const glow = new THREE.Sprite(shared.torchGlowM);
  glow.position.set(0, 0.82, 0.12);
  glow.scale.setScalar(0.9);
  g.add(glow);

  return { g, flame, glow, ph: Math.random() * 10 };
}

export function makeBats() {
  // 저사양(그래픽 품질 '낮음', 해상도 자동 축소)에서도 보이도록 몸집을 키우고 스스로 빛나게 했어요.
  const geo = mergeGeos([
    new THREE.SphereGeometry(0.065, 6, 5).scale(1, 0.8, 1.4),
    new THREE.BoxGeometry(0.24, 0.02, 0.13).translate(0.14, 0, 0),
    new THREE.BoxGeometry(0.24, 0.02, 0.13).translate(-0.14, 0, 0),
  ]);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3a3048,
    roughness: 0.7,
    emissive: 0xb02a2a,
    emissiveIntensity: 0.9,
  });
  const im = new THREE.InstancedMesh(geo, mat, 7);
  im.castShadow = true;
  im.frustumCulled = false;
  return { im, n: 7, ph: Math.random() * 6 };
}
