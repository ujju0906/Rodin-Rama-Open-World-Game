import * as THREE from 'three';
import { ATMOSPHERE as A } from '../data/atmosphere';
import { lerp, smoothstep } from '../core/noise';

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize( position );
  vec4 p = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // always at the far plane
}`;

const fragmentShader = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uFog;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform float uNight;
uniform float uTime;
uniform float uCloudCover;

float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float hash3( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
float noise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), f.x ),
              mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), f.x ), f.y );
}
float fbm( vec2 p ) {
  float s = 0.0; float a = 0.5;
  for ( int i = 0; i < CLOUD_OCTAVES; i++ ) { s += a * noise( p ); p = p * 2.03 + 17.0; a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize( vDir );
  float up = max( d.y, 0.0 );

  // Base gradient: horizon haze up to deep zenith.
  vec3 col = mix( uHorizon, uZenith, pow( up, 0.42 ) );

  // Sun glow: wide warm bloom plus a tight halo.
  float sd = max( dot( d, uSunDir ), 0.0 );
  col += uSunColor * ( 0.22 * pow( sd, 6.0 ) + 0.5 * pow( sd, 48.0 ) + 1.6 * pow( sd, 600.0 ) );

  // Moon disc and glow.
  float md = max( dot( d, uMoonDir ), 0.0 );
  vec3 moonCol = vec3( 0.7, 0.82, 1.0 );
  col += moonCol * uNight * ( smoothstep( 0.9994, 0.9997, md ) * 2.2 + 0.25 * pow( md, 200.0 ) + 0.05 * pow( md, 12.0 ) );

  // Stars.
  vec3 sp = d * 220.0;
  vec3 cell = floor( sp );
  float star = hash3( cell );
  float tw = 0.6 + 0.4 * sin( uTime * 2.0 + star * 90.0 );
  float starMask = smoothstep( 0.9975, 1.0, star ) * ( 1.0 - smoothstep( 0.0, 0.45, length( fract( sp ) - 0.5 ) ) );
  col += vec3( 0.9, 0.95, 1.0 ) * starMask * tw * uNight * 3.0 * smoothstep( 0.02, 0.25, d.y );

  // Clouds on a flat layer above the viewer.
  if ( d.y > 0.01 ) {
    vec2 uv = d.xz / ( d.y + 0.12 ) * 1.1 + vec2( uTime * 0.006, uTime * 0.002 );
    float n = fbm( uv );
    float cover = smoothstep( 1.0 - uCloudCover, 1.0 - uCloudCover + 0.32, n );
    float shade = fbm( uv + uSunDir.xz * 0.25 );
    vec3 lit = mix( uHorizon * 0.9, uSunColor * 0.9 + uHorizon * 0.35, smoothstep( 0.35, 0.75, 1.0 - shade ) );
    lit += uSunColor * pow( sd, 10.0 ) * 0.9;             // silver/gold lining towards the sun
    lit = mix( lit, vec3( 0.02, 0.03, 0.06 ) + moonCol * 0.05 * pow( md, 4.0 ), uNight * 0.92 );
    float fade = smoothstep( 0.01, 0.22, d.y );
    col = mix( col, lit, cover * fade * 0.9 );
  }

  // Below the horizon, and a soft band just above it, dissolve into fog colour.
  float haze = 1.0 - smoothstep( -0.02, 0.16, d.y );
  col = mix( col, uFog + uSunColor * 0.25 * pow( sd, 5.0 ), haze );

  gl_FragColor = vec4( col, 1.0 );
}`;

const v3 = (a: readonly number[]): THREE.Vector3 => new THREE.Vector3(a[0], a[1], a[2]);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/** Everything the rest of the game needs to know about the current light. */
export interface SkyState {
  hour: number;
  sunDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  /** Direction of whichever body is currently lighting the scene. */
  lightDir: THREE.Vector3;
  lightColor: THREE.Color;
  lightIntensity: number;
  fogColor: THREE.Color;
  fogDensity: number;
  /** 0 at full day, 1 at full night. */
  night: number;
  /** 1 around sunrise/sunset. */
  golden: number;
}

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly state: SkyState = {
    hour: A.startHour,
    sunDir: new THREE.Vector3(),
    moonDir: new THREE.Vector3(),
    lightDir: new THREE.Vector3(),
    lightColor: new THREE.Color(),
    lightIntensity: 1,
    fogColor: new THREE.Color(),
    fogDensity: 0.01,
    night: 0,
    golden: 0,
  };

  constructor(cloudOctaves: number) {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
      defines: { CLOUD_OCTAVES: cloudOctaves },
      uniforms: {
        uZenith: { value: new THREE.Vector3() },
        uHorizon: { value: new THREE.Vector3() },
        uFog: { value: new THREE.Vector3() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Vector3(1, 1, 1) },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uNight: { value: 0 },
        uTime: { value: 0 },
        uCloudCover: { value: 0.52 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.material);
    this.mesh.scale.setScalar(1500);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.setHour(A.startHour);
  }

  setCloudOctaves(n: number): void {
    this.material.defines.CLOUD_OCTAVES = n;
    this.material.needsUpdate = true;
  }

  /** Recomputes sun, moon, colours and fog for a game hour (0..24). */
  setHour(hour: number): void {
    const s = this.state;
    s.hour = ((hour % 24) + 24) % 24;
    const ang = (s.hour / 24) * Math.PI * 2 - Math.PI / 2; // sunrise at 6, noon at 12
    s.sunDir.set(Math.cos(ang), Math.sin(ang), 0.38).normalize();
    s.moonDir.set(-Math.cos(ang), -Math.sin(ang), -0.3).normalize();

    const y = s.sunDir.y;
    const day = smoothstep(-0.12, 0.18, y);
    s.night = 1 - day;
    s.golden = (1 - smoothstep(0.02, 0.42, Math.abs(y))) * smoothstep(-0.22, -0.02, y);

    const u = this.material.uniforms;
    const zenith = tmpA.copy(v3(A.zenithNight)).lerp(v3(A.zenithDay), day);
    (u.uZenith!.value as THREE.Vector3).copy(zenith);
    const horizon = tmpB.copy(v3(A.horizonNight)).lerp(v3(A.horizonDay), day);
    horizon.lerp(v3(A.horizonGolden), s.golden * 0.72);
    (u.uHorizon!.value as THREE.Vector3).copy(horizon);

    const sunCol = v3(A.sunColorLow).lerp(v3(A.sunColorHigh), smoothstep(0.05, 0.5, y));
    const sunVis = smoothstep(-0.08, 0.06, y);
    (u.uSunColor!.value as THREE.Vector3).copy(sunCol).multiplyScalar(sunVis * 1.6);
    (u.uSunDir!.value as THREE.Vector3).copy(s.sunDir);
    (u.uMoonDir!.value as THREE.Vector3).copy(s.moonDir);
    u.uNight!.value = s.night;

    // Scene light: the sun while it is up, otherwise the moon.
    const sunStrength = smoothstep(-0.04, 0.22, y) * A.sunIntensity;
    const moonStrength = s.night * smoothstep(-0.05, 0.2, s.moonDir.y) * A.moonIntensity;
    if (sunStrength >= moonStrength) {
      s.lightDir.copy(s.sunDir);
      s.lightColor.setRGB(sunCol.x, sunCol.y, sunCol.z);
      s.lightIntensity = sunStrength;
    } else {
      s.lightDir.copy(s.moonDir);
      s.lightColor.setRGB(A.moonColor[0], A.moonColor[1], A.moonColor[2]);
      s.lightIntensity = moonStrength;
    }

    // Fog: horizon colour, a little darker, thicker at dawn/dusk and at night.
    s.fogColor.setRGB(horizon.x * 0.82, horizon.y * 0.84, horizon.z * 0.88);
    (u.uFog!.value as THREE.Vector3).set(s.fogColor.r, s.fogColor.g, s.fogColor.b);
    s.fogDensity = lerp(
      lerp(A.fogDensityDay, A.fogDensityNight, s.night),
      A.fogDensityDawn,
      s.golden,
    );
  }

  update(elapsed: number, camera: THREE.Camera): void {
    this.material.uniforms.uTime!.value = elapsed;
    this.mesh.position.copy(camera.position);
  }
}
