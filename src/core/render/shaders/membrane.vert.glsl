attribute vec2 aPosition;
attribute vec3 aNormal;
attribute float aPresence;
attribute float aCurvature;
attribute float aLegacy;

uniform vec2 uResolution;

varying vec2 vUv;
varying vec3 vNormal;
varying float vPresence;
varying float vCurvature;
varying float vLegacy;

void main() {
  vec2 clip =
    (aPosition / uResolution) * 2.0 - 1.0;

  gl_Position =
    vec4(clip.x, -clip.y, 0.0, 1.0);

  vUv = aPosition / uResolution;
  vNormal = aNormal;
  vPresence = aPresence;
  vCurvature = aCurvature;
  vLegacy = aLegacy;
}