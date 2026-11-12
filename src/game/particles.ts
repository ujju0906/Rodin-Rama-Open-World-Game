import * as THREE from 'three';

const vertex = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
uniform float uPixelRatio;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio * ( 300.0 / max( -mv.z, 0.5 ) );
}`;
const fragment = /* glsl */ `
varying vec3 vColor;
void main() {
  float a = smoothstep( 0.5, 0.0, length( gl_PointCoord - 0.5 ) );
  gl_FragColor = vec4( vColor * a * a, 1.0 );
}`;

/** One pooled, additive particle system used for fire, wind, sparks, smoke and glyph light. */
export class Particles {
  readonly points: THREE.Points;
  private readonly n: number;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private base: Float32Array; // r,g,b,size
  private life: Float32Array; // remaining, total
  private phys: Float32Array; // gravity, drag
  private cursor = 0;
  private material: THREE.ShaderMaterial;

  constructor(capacity = 5000) {
    this.n = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.base = new Float32Array(capacity * 4);
    this.life = new Float32Array(capacity * 2);
    this.phys = new Float32Array(capacity * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      fog: false,
      uniforms: { uPixelRatio: { value: 1 } },
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }

  setPixelRatio(r: number): void {
    this.material.uniforms.uPixelRatio!.value = r;
  }

  emit(
    p: THREE.Vector3,
    v: THREE.Vector3,
    life: number,
    color: readonly [number, number, number],
    size: number,
    gravity = 0,
    drag = 0,
  ): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.base.set([color[0], color[1], color[2], size], i * 4);
    this.life.set([life, life], i * 2);
    this.phys.set([gravity, drag], i * 2);
  }

  /** Emits `count` particles from a point with random velocity inside a sphere of `speed`. */
  burst(
    p: THREE.Vector3,
    count: number,
    speed: number,
    life: number,
    color: readonly [number, number, number],
    size: number,
    gravity = 0,
    drag = 1,
    up = 0,
  ): void {
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      v.y += up;
      this.emit(
        p,
        v,
        life * (0.5 + Math.random() * 0.5),
        color,
        size * (0.6 + Math.random() * 0.8),
        gravity,
        drag,
      );
    }
  }

  update(dt: number): void {
    const { pos, vel, col, size, base, life, phys } = this;
    for (let i = 0; i < this.n; i++) {
      const l = life[i * 2]!;
      if (l <= 0) {
        if (size[i] !== 0) size[i] = 0;
        continue;
      }
      const nl = l - dt;
      life[i * 2] = nl;
      const k = Math.max(0, nl / life[i * 2 + 1]!);
      const drag = Math.max(0, 1 - phys[i * 2 + 1]! * dt);
      vel[i * 3] = vel[i * 3]! * drag;
      vel[i * 3 + 1] = vel[i * 3 + 1]! * drag - phys[i * 2]! * dt;
      vel[i * 3 + 2] = vel[i * 3 + 2]! * drag;
      pos[i * 3] = pos[i * 3]! + vel[i * 3]! * dt;
      pos[i * 3 + 1] = pos[i * 3 + 1]! + vel[i * 3 + 1]! * dt;
      pos[i * 3 + 2] = pos[i * 3 + 2]! + vel[i * 3 + 2]! * dt;
      const fade = k * (2 - k);
      col[i * 3] = base[i * 4]! * fade;
      col[i * 3 + 1] = base[i * 4 + 1]! * fade * k;
      col[i * 3 + 2] = base[i * 4 + 2]! * fade * k;
      size[i] = nl > 0 ? base[i * 4 + 3]! * (0.5 + 0.5 * k) : 0;
    }
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }
}
