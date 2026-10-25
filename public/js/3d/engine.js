// Three.js 3D 렌더링 엔진, 조명, 후처리(Bloom), 품질 관리
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { store, QUALITY_KEY } from "../store.js";
import { fx } from "./particles.js";

export { THREE };

export let renderer = null;
export let scene = null;
export let cam = null;
export let composer = null;
export let bloomPass = null;
export let mergeGeos = null;

export const dyn = { scale: 1 };
export let Q = store.get(QUALITY_KEY, "high");
export const shared = {};
let glCanvas = null;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function makeSharedAssets() {
  const R = rng(7);

  // 돌벽 텍스처
  shared.stoneTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#1c1d24";
    g.fillRect(0, 0, w, h);
    const bh = 32;
    for (let y = 0, row = 0; y < h; y += bh, row++) {
      const off = row % 2 ? 32 : 0;
      for (let x = -off; x < w; x += 64) {
        const l = 34 + R() * 22, hue = 225 + R() * 30;
        g.fillStyle = `hsl(${hue} 8% ${l}%)`;
        g.fillRect(x + 2, y + 2, 60, bh - 4);
        g.fillStyle = `rgba(255,255,255,${0.05 + R() * 0.05})`;
        g.fillRect(x + 2, y + 2, 60, 3);
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(x + 2, y + bh - 6, 60, 4);
      }
    }
    for (let i = 0; i < 3500; i++) {
      g.fillStyle = `rgba(${R() < 0.5 ? "0,0,0" : "255,255,255"},${R() * 0.08})`;
      g.fillRect(R() * w, R() * h, 2, 2);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(70,110,60,${0.08 + R() * 0.1})`;
      g.beginPath();
      g.arc(R() * w, h - R() * 50, 4 + R() * 12, 0, Math.PI * 2);
      g.fill();
    }
  }, true);

  shared.wallMat = new THREE.MeshStandardMaterial({
    map: shared.stoneTex,
    bumpMap: shared.stoneTex,
    bumpScale: 3.5,
    roughness: 0.92,
    metalness: 0.02,
  });

  // 바닥 타일 텍스처
  shared.tileTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#2d2f38";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(${R() < 0.5 ? "0,0,0" : "255,255,255"},${R() * 0.07})`;
      g.fillRect(R() * w, R() * h, 2, 2);
    }
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      let x = R() * w, y = R() * h;
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (R() - 0.5) * 50;
        y += (R() - 0.5) * 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.strokeStyle = "rgba(255,255,255,0.06)";
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
  });

  shared.tileMat = new THREE.MeshStandardMaterial({
    map: shared.tileTex,
    bumpMap: shared.tileTex,
    bumpScale: 1.5,
    roughness: 0.8,
    metalness: 0.05,
  });

  shared.capTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#3b4038";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = `rgba(${R() < 0.5 ? "20,30,20" : "120,140,110"},${R() * 0.25})`;
      g.fillRect(R() * w, R() * h, 3, 3);
    }
  });
  shared.capMat = new THREE.MeshStandardMaterial({ map: shared.capTex, roughness: 0.95 });

  shared.waterTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#1d4f7a";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(190, 230, 255, ${0.06 + R() * 0.14})`;
      g.lineWidth = 1 + R() * 2;
      g.beginPath();
      const y = R() * h, x = R() * w;
      g.moveTo(x, y);
      g.bezierCurveTo(x + 20, y - 6, x + 40, y + 6, x + 60, y);
      g.stroke();
    }
  }, true);

  shared.lavaTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#c22a00";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = R() * w, y = R() * h, r = 8 + R() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const hot = R() < 0.5;
      gr.addColorStop(0, hot ? "rgba(255, 220, 90, 0.9)" : "rgba(40, 6, 0, 0.85)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, true);

  shared.plankTex = canvasTex(128, 128, (g, w, h) => {
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `hsl(${24 + R() * 8} ${45 + R() * 10}% ${36 + R() * 8}%)`;
      g.fillRect(0, i * 32, w, 32);
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(40, 20, 8, ${0.15 + R() * 0.2})`;
        g.lineWidth = 1;
        g.beginPath();
        const y = i * 32 + 3 + R() * 26;
        g.moveTo(0, y);
        g.bezierCurveTo(w * 0.3, y + R() * 4 - 2, w * 0.7, y + R() * 4 - 2, w, y);
        g.stroke();
      }
      g.fillStyle = "rgba(20, 10, 4, 0.8)";
      g.fillRect(0, i * 32, w, 3);
      g.fillStyle = "rgba(30, 30, 34, 0.9)";
      g.fillRect(10, i * 32 + 12, 5, 5);
      g.fillRect(w - 15, i * 32 + 12, 5, 5);
    }
  });

  shared.slabMat = new THREE.MeshStandardMaterial({
    map: shared.plankTex,
    emissiveMap: shared.plankTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.22,
    roughness: 0.8,
  });

  shared.flameM = new THREE.MeshStandardMaterial({
    color: 0xffd080,
    emissive: 0xff8a2a,
    emissiveIntensity: 4.5,
    transparent: true,
    opacity: 0.95,
  });

  shared.iron = new THREE.MeshStandardMaterial({
    color: 0x3a3c44,
    roughness: 0.45,
    metalness: 0.75,
  });

  shared.dotTex = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.35, "rgba(255,255,255,0.6)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });

  shared.ringTex = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,0.9)");
    gr.addColorStop(0.5, "rgba(255,255,255,0.35)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });

  shared.swirlTex = canvasTex(256, 256, (g, w, h) => {
    g.translate(w / 2, h / 2);
    for (let i = 0; i < 260; i++) {
      const a = i * 0.21, r = i * 0.45;
      g.fillStyle = `rgba(170,235,255,${0.5 - i / 600})`;
      g.beginPath();
      g.arc(Math.cos(a) * r, Math.sin(a) * r, 5 + i / 40, 0, Math.PI * 2);
      g.fill();
    }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 128);
    gr.addColorStop(0, "rgba(255,255,255,0.9)");
    gr.addColorStop(0.4, "rgba(120,210,255,0.35)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(-128, -128, 256, 256);
  });

  shared.beamTex = canvasTex(8, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, "rgba(255,255,255,0.9)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });

  shared.torchGlowM = new THREE.SpriteMaterial({
    map: shared.dotTex,
    color: 0xff9a40,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  for (const k of Object.keys(shared)) {
    if (shared[k]?.isMaterial || shared[k]?.isTexture) {
      shared[k].userData.shared = true;
    }
  }
}

export async function initGL(canvas) {
  glCanvas = canvas;

  mergeGeos = (list) => {
    if (list.some((g2) => !g2.index) && list.some((g2) => g2.index)) {
      list = list.map((g2) => {
        if (!g2.index) return g2;
        const n = g2.toNonIndexed();
        g2.dispose();
        return n;
      });
    }
    const m = mergeGeometries(list, false);
    list.forEach((g2) => g2.dispose());
    return m;
  };

  renderer = new THREE.WebGLRenderer({
    canvas: glCanvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06070c);
  scene.fog = new THREE.FogExp2(0x06070c, 0.05);

  cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 120);
  cam.position.set(0, 14, 10);

  const hemi = new THREE.HemisphereLight(0x5a6a9a, 0x2a2018, 1.0);
  shared.hemi = hemi;
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0x9db4ff, 1.3);
  moon.position.set(-6, 14, 6);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.bias = -0.0008;
  moon.shadow.normalBias = 0.02;
  scene.add(moon, moon.target);
  shared.moon = moon;

  // 점 조명 인스턴스 (셰이더 재컴파일 방지를 위한 고정 풀)
  shared.L = {
    lantern: new THREE.PointLight(0xffb066, 9, 7, 1.6),
    exit: new THREE.PointLight(0x9fe8ff, 0, 5, 1.6),
    torch: [new THREE.PointLight(0xff9a40, 0, 5, 1.7), new THREE.PointLight(0xff9a40, 0, 5, 1.7)],
    mon: [new THREE.PointLight(0xff2a1a, 0, 3.5, 1.8), new THREE.PointLight(0xff2a1a, 0, 3.5, 1.8)],
  };
  scene.add(shared.L.lantern, shared.L.exit, ...shared.L.torch, ...shared.L.mon);

  makeSharedAssets();

  // 먼지 부유 입자
  const N = 260, pos = new Float32Array(N * 3);
  const dust = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      map: shared.dotTex,
      size: 0.035,
      color: 0xb9c4e6,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  dust.geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  dust.userData.seed = Array.from({ length: N }, () => [
    Math.random(),
    Math.random(),
    Math.random(),
    Math.random() * 6.28,
  ]);
  scene.add(dust);
  shared.dust = dust;

  fx.init(THREE, scene, shared.dotTex);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.8, 0.6, 0.82);
  const full = bloomPass.setSize.bind(bloomPass);
  bloomPass.setSize = (w, h) =>
    full(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  resize();
  window.addEventListener("resize", resize);
}

export function resize() {
  if (!renderer || !glCanvas) return;
  const w = glCanvas.clientWidth || window.innerWidth;
  const h = glCanvas.clientHeight || window.innerHeight;
  const pr = Math.min(window.devicePixelRatio || 1, Q === "high" ? 1.25 : 0.75) * dyn.scale;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
}

export function setQuality(newQ) {
  Q = newQ;
  store.set(QUALITY_KEY, Q);
  applyQuality();
}

export function applyQuality() {
  const hi = Q === "high";
  if (!renderer) return;
  renderer.shadowMap.enabled = hi;
  renderer.shadowMap.needsUpdate = true;
  scene.traverse((o) => {
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
    }
  });
  resize();
}
