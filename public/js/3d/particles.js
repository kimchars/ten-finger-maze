// GPU 가속 3D 파티클 시스템
export const fx = {
  N: 700,
  i: 0,
  init(THREE, scene, dotTex) {
    this.THREE = THREE;
    const N = this.N;
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.base = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N);
    this.max = new Float32Array(N);
    this.grav = new Float32Array(N);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));

    this.pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.09,
        map: dotTex,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.pts.frustumCulled = false;

    for (let k = 0; k < N; k++) {
      this.pos[k * 3 + 1] = -99;
    }
    scene.add(this.pts);
  },

  emit(x, y, z, vx, vy, vz, color, life, grav = -3) {
    const k = (this.i = (this.i + 1) % this.N);
    const c = new this.THREE.Color(color);
    this.pos.set([x, y, z], k * 3);
    this.vel.set([vx, vy, vz], k * 3);
    this.base.set([c.r, c.g, c.b], k * 3);
    this.life[k] = life;
    this.max[k] = life;
    this.grav[k] = grav;
  },

  burst(p, n, colors, speed = 2.6) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 1.2;
      const s = speed * (0.4 + Math.random());
      this.emit(
        p.x,
        p.y + 0.4,
        p.z,
        Math.cos(a) * Math.cos(e) * s,
        Math.sin(e) * s + 1,
        Math.sin(a) * Math.cos(e) * s,
        colors[k % colors.length],
        0.7 + Math.random() * 0.7
      );
    }
  },

  update(dt) {
    const s = dt / 1000;
    let alive = 0;
    for (let k = 0; k < this.N; k++) {
      if (this.life[k] <= 0) continue;
      alive++;
      this.life[k] -= s;
      const j = k * 3;
      this.vel[j + 1] += this.grav[k] * s;
      this.pos[j] += this.vel[j] * s;
      this.pos[j + 1] += this.vel[j + 1] * s;
      this.pos[j + 2] += this.vel[j + 2] * s;

      if (this.pos[j + 1] < 0.03) {
        this.pos[j + 1] = 0.03;
        this.vel[j + 1] *= -0.3;
      }
      const f = Math.max(0, this.life[k] / this.max[k]);
      this.col[j] = this.base[j] * f;
      this.col[j + 1] = this.base[j + 1] * f;
      this.col[j + 2] = this.base[j + 2] * f;

      if (this.life[k] <= 0) {
        this.pos[j + 1] = -99;
      }
    }
    if (alive || this.wasAlive) {
      this.pts.geometry.attributes.position.needsUpdate = true;
      this.pts.geometry.attributes.color.needsUpdate = true;
    }
    this.wasAlive = alive > 0;
  },
};
