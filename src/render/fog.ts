import * as THREE from 'three';
import { ATMOSPHERE } from '../data/atmosphere';

/**
 * Height fog. Replaces Three's built-in fog shader chunks so that every standard material
 * gets fog that is thick near the ground and thins out with height.
 * Colour and density still come from `scene.fog` (a FogExp2), so they can change over the day.
 */
export function installHeightFog(): void {
  const falloff = ATMOSPHERE.fogHeightFalloff.toFixed(4);
  const base = ATMOSPHERE.fogBaseHeight.toFixed(2);

  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorldPosition;
#endif`;

  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vec4 fogWorldPos = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    fogWorldPos = instanceMatrix * fogWorldPos;
  #endif
  vFogWorldPosition = ( modelMatrix * fogWorldPos ).xyz;
#endif`;

  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vFogWorldPosition;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;

  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    vec3 fogRay = vFogWorldPosition - cameraPosition;
    float fogDist = length( fogRay );
    float fogDy = fogRay.y / max( fogDist, 0.0001 );
    float fogB = ${falloff};
    float fogCamH = max( cameraPosition.y - ${base}, -20.0 );
    // Analytic integral of exponential height fog along the view ray.
    float fogK = abs( fogDy ) < 0.0005
      ? fogDist
      : ( 1.0 - exp( -fogDist * fogDy * fogB ) ) / ( fogDy * fogB );
    float fogOptical = fogDensity * exp( -fogCamH * fogB ) * fogK;
    float fogFactor = 1.0 - exp( -fogOptical );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, length( vFogWorldPosition - cameraPosition ) );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, clamp( fogFactor, 0.0, 1.0 ) );
#endif`;
}
