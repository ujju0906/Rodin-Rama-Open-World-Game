import * as THREE from 'three';
import { POI, WORLD } from '../data/world';
import type { SkyState } from './sky';
import type { GameTextures } from './textures';

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec3 transformed = position;
  vWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4( vWorld, 1.0 );
  #include <fog_vertex>
}`;

const fragmentShader = /* glsl */ `
precision highp float;
#include <common>
#include <fog_pars_fragment>
varying vec3 vWorld;
uniform sampler2D uHeight;
uniform sampler2D uNormalMap;
uniform float uTime;
uniform float uLevel;
uniform float uWorldSize;
uniform float uRain;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uSwamp; // x, z, radius

void main() {
  vec2 huv = vWorld.xz / uWorldSize + 0.5;
  float ground = texture2D( uHeight, huv ).r * 12.0 - 6.0;
  float depth = uLevel - ground;
  if ( depth < -0.02 ) discard;

  float swamp = 1.0 - smoothstep( uSwamp.z * 0.7, uSwamp.z * 1.5, distance( vWorld.xz, uSwamp.xy ) );
  float flow = mix( 1.0, 0.08, swamp ); // the river runs, the swamp stands still

  // Two scrolling normal layers, drifting downstream (+x).
  vec2 uv = vWorld.xz * 0.09;
  vec3 n1 = texture2D( uNormalMap, uv + vec2( -uTime * 0.045 * flow, uTime * 0.012 ) ).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D( uNormalMap, uv * 2.3 + vec2( -uTime * 0.07 * flow, -uTime * 0.02 ) ).xyz * 2.0 - 1.0;
  vec3 n3 = texture2D( uNormalMap, uv * 7.0 + vec2( uTime * 0.11, uTime * 0.09 ) ).xyz * 2.0 - 1.0; // rain chop
  vec3 nt = n1 + n2 * 0.7 + n3 * uRain * 0.9;
  vec3 N = normalize( vec3( nt.x * 0.34, 1.0, nt.y * 0.34 ) );

  vec3 V = normalize( cameraPosition - vWorld );
  float fres = 0.03 + 0.97 * pow( 1.0 - max( dot( N, V ), 0.0 ), 5.0 );
  vec3 R = reflect( -V, N );
  R.y = abs( R.y );

  // Reflected sky plus the sun or moon glitter path.
  vec3 sky = mix( uHorizon, uZenith, pow( R.y, 0.45 ) );
  float spec = pow( max( dot( R, uLightDir ), 0.0 ), 260.0 );
  vec3 refl = sky + uLightColor * spec * 3.0;

  // Water body: clear shallows, deep teal channel, murky green in the swamp.
  float deep = smoothstep( 0.0, 2.6, depth );
  vec3 body = mix( vec3( 0.16, 0.26, 0.2 ), vec3( 0.015, 0.07, 0.075 ), deep );
  body = mix( body, vec3( 0.045, 0.06, 0.018 ), swamp );
  float lightAmt = dot( uHorizon, vec3( 0.3, 0.5, 0.2 ) ) * 1.3 + 0.02;
  body *= lightAmt;

  vec3 col = mix( body, refl, fres );

  // Foam along the banks and in the fast shallows.
  float foamNoise = texture2D( uNormalMap, vWorld.xz * 0.3 + vec2( -uTime * 0.06 * flow, 0.0 ) ).r;
  float foam = smoothstep( 0.22, 0.0, depth ) * smoothstep( 0.5, 0.72, foamNoise + 0.25 * sin( uTime * 1.3 + vWorld.x * 0.7 ) ) * ( 1.0 - swamp );
  col = mix( col, vec3( lightAmt * 2.2 ) + uLightColor * 0.08, foam * 0.4 );

  float alpha = clamp( smoothstep( 0.0, 0.22, depth ) * mix( 0.72, 0.97, deep ) + fres * 0.6 + foam * 0.5, 0.0, 1.0 );
  gl_FragColor = vec4( col, alpha );
  #include <fog_fragment>
}`;

export class Water {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(heightTexture: THREE.Texture, tex: GameTextures) {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uHeight: { value: null },
          uNormalMap: { value: null },
          uTime: { value: 0 },
          uLevel: { value: WORLD.waterLevel },
          uWorldSize: { value: WORLD.size },
          uRain: { value: 0 },
          uZenith: { value: new THREE.Vector3() },
          uHorizon: { value: new THREE.Vector3() },
          uLightDir: { value: new THREE.Vector3(0, 1, 0) },
          uLightColor: { value: new THREE.Vector3(1, 1, 1) },
          uSwamp: { value: new THREE.Vector3(POI.swamp.x, POI.swamp.z, POI.swamp.r) },
        },
      ]),
    });
    this.material.uniforms.uHeight!.value = heightTexture;
    this.material.uniforms.uNormalMap!.value = tex.waterNormal;
    const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.y = WORLD.waterLevel;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'water';
  }

  update(
    elapsed: number,
    sky: SkyState,
    skyUniforms: Record<string, THREE.IUniform>,
    rain: number,
  ): void {
    const u = this.material.uniforms;
    u.uTime!.value = elapsed;
    u.uRain!.value = rain;
    (u.uZenith!.value as THREE.Vector3).copy(skyUniforms.uZenith!.value as THREE.Vector3);
    (u.uHorizon!.value as THREE.Vector3).copy(skyUniforms.uHorizon!.value as THREE.Vector3);
    (u.uLightDir!.value as THREE.Vector3).copy(sky.lightDir);
    (u.uLightColor!.value as THREE.Vector3)
      .set(sky.lightColor.r, sky.lightColor.g, sky.lightColor.b)
      .multiplyScalar(sky.lightIntensity);
  }
}
