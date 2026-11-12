import * as THREE from 'three';
import { mulberry32 } from '../core/noise';

const rainVertex = /* glsl */ `
attribute vec3 aSeed;
attribute float aEnd;
uniform float uTime;
uniform vec3 uCam;
uniform float uAmount;
varying float vAlpha;
const vec3 BOX = vec3( 36.0, 26.0, 36.0 );
void main() {
  float speed = 21.0 + aSeed.y * 9.0;
  vec3 fall = vec3( 2.6, -speed, 0.9 );
  vec3 p = aSeed * BOX + fall * uTime;
  p = mod( p - uCam, BOX ) - BOX * 0.5 + uCam;
  p -= normalize( fall ) * aEnd * ( 0.35 + aSeed.x * 0.35 );
  vec4 mv = viewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mv;
  // Drops beyond the active fraction are hidden so intensity can ramp smoothly.
  vAlpha = step( fract( aSeed.z * 7.13 ), uAmount ) * ( 1.0 - aEnd * 0.7 ) * smoothstep( 18.0, 6.0, -mv.z ) ;
}`;
const rainFragment = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() { gl_FragColor = vec4( uColor * vAlpha, 1.0 ); }`;

const flyVertex = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uCam;
uniform float uPixelRatio;
uniform float uGroundY;
varying float vAlpha;
const vec3 BOX = vec3( 70.0, 9.0, 70.0 );
void main() {
  float t = uTime * ( 0.2 + aSeed.x * 0.3 ) + aSeed.y * 50.0;
  vec3 p = aSeed.xyz * BOX + vec3( sin( t * 1.1 + aSeed.z * 6.0 ) * 2.2, sin( t * 0.7 ) * 0.9, cos( t * 0.9 + aSeed.w * 6.0 ) * 2.2 );
  vec3 anchor = vec3( uCam.x, uGroundY + 4.2, uCam.z );
  p = mod( p - anchor, BOX ) - BOX * 0.5 + anchor;
  vec4 mv = viewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mv;
  vAlpha = pow( 0.5 + 0.5 * sin( t * 6.0 + aSeed.w * 40.0 ), 3.0 );
  gl_PointSize = ( 2.0 + aSeed.w * 3.5 ) * uPixelRatio * ( 30.0 / max( -mv.z, 1.0 ) );
}`;
const flyFragment = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float a = smoothstep( 0.5, 0.0, length( gl_PointCoord - 0.5 ) );
  gl_FragColor = vec4( uColor * a * a * vAlpha, 1.0 );
}`;

/** Rain streaks and drifting motes (embers by day, fireflies at night), both wrapped around the camera. */
export class Weather {
  readonly group = new THREE.Group();
  /** Current rain strength 0..1 (eased towards `rainTarget`). */
  rain = 0;
  rainTarget = 0.55;
  private rainMat: THREE.ShaderMaterial;
  private flyMat: THREE.ShaderMaterial;
  private rainLines: THREE.LineSegments | null = null;
  private flies: THREE.Points | null = null;

  constructor() {
    const common = {
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      fog: false,
    };
    this.rainMat = new THREE.ShaderMaterial({
      ...common,
      vertexShader: rainVertex,
      fragmentShader: rainFragment,
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uAmount: { value: 0 },
        uColor: { value: new THREE.Color(0.5, 0.56, 0.62) },
      },
    });
    this.flyMat = new THREE.ShaderMaterial({
      ...common,
      vertexShader: flyVertex,
      fragmentShader: flyFragment,
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uPixelRatio: { value: 1 },
        uGroundY: { value: 0 },
        uColor: { value: new THREE.Color() },
      },
    });
    this.group.name = 'weather';
  }

  build(density: number, pixelRatio: number): void {
    for (const o of [this.rainLines, this.flies]) {
      if (o) {
        this.group.remove(o);
        o.geometry.dispose();
      }
    }
    const rand = mulberry32(31);
    const drops = Math.floor(9000 * density) + 1500;
    const seed = new Float32Array(drops * 2 * 3);
    const end = new Float32Array(drops * 2);
    for (let i = 0; i < drops; i++) {
      const s = [rand(), rand(), rand()];
      seed.set(s, i * 6);
      seed.set(s, i * 6 + 3);
      end[i * 2 + 1] = 1;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(drops * 6), 3));
    rg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    rg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rainLines = new THREE.LineSegments(rg, this.rainMat);
    this.rainLines.frustumCulled = false;
    this.rainLines.renderOrder = 5;

    const count = Math.floor(700 * density) + 150;
    const fs = new Float32Array(count * 4);
    for (let i = 0; i < fs.length; i++) fs[i] = rand();
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    fg.setAttribute('aSeed', new THREE.BufferAttribute(fs, 4));
    this.flies = new THREE.Points(fg, this.flyMat);
    this.flies.frustumCulled = false;
    this.flies.renderOrder = 5;
    this.flyMat.uniforms.uPixelRatio!.value = pixelRatio;
    this.group.add(this.rainLines, this.flies);
  }

  update(
    dt: number,
    elapsed: number,
    camera: THREE.Vector3,
    groundY: number,
    night: number,
    lightLevel: number,
  ): void {
    this.rain += (this.rainTarget - this.rain) * Math.min(1, dt * 0.5);
    const r = this.rainMat.uniforms;
    r.uTime!.value = elapsed;
    (r.uCam!.value as THREE.Vector3).copy(camera);
    r.uAmount!.value = this.rain;
    (r.uColor!.value as THREE.Color)
      .setRGB(0.5, 0.56, 0.62)
      .multiplyScalar(0.08 + lightLevel * 0.3);
    this.rainLines!.visible = this.rain > 0.01;

    const f = this.flyMat.uniforms;
    f.uTime!.value = elapsed;
    (f.uCam!.value as THREE.Vector3).copy(camera);
    f.uGroundY!.value = groundY;
    // Warm drifting motes by day (washed out by rain), green fireflies at night.
    const day = (1 - night) * (1 - this.rain * 0.8) * 0.5;
    (f.uColor!.value as THREE.Color).setRGB(
      3.0 * day + 0.7 * night,
      1.4 * day + 2.6 * night,
      0.35 * day + 0.9 * night,
    );
  }
}
