precision highp float;

varying vec2 vUv;
varying vec3 vNormal;
varying float vPresence;
varying float vCurvature;
varying float vLegacy;

uniform vec2 uResolution;
uniform float uAspect;
uniform float uTime;
uniform float uNormalDistortion;

uniform vec3 uBackgroundColor;
uniform vec3 uMembraneColor;
uniform vec3 uCoolStarColor;
uniform vec3 uWarmStarColor;

/*
 * 美感控制。
 *
 * QUIET_MARKS：
 * 平靜時仍可看見多少離散參照物。
 *
 * FIBRE_GAIN：
 * 活動時方向脈絡浮現的強度。
 *
 * WARM_EVENT_GAIN：
 * 高能事件中的少量暖色。
 */
const float QUIET_MARKS = 0.14;
const float FIBRE_GAIN = 0.17;
const float WARM_EVENT_GAIN = 0.52;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);

  local =
    local *
    local *
    (3.0 - 2.0 * local);

  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));

  return mix(
    mix(a, b, local.x),
    mix(c, d, local.x),
    local.y
  );
}

float fbm(vec2 p) {
  float result = 0.0;
  float amplitude = 0.5;

  for (int octave = 0; octave < 4; octave += 1) {
    result += valueNoise(p) * amplitude;

    p =
      p * 2.03 +
      vec2(17.1, 9.2);

    amplitude *= 0.5;
  }

  return result;
}

mat2 rotate2d(float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);

  return mat2(
    cosine,
    -sine,
    sine,
    cosine
  );
}

float latentMicrostructure(
  vec2 uv,
  float reveal
) {
  /*
   * uv 已是等比例 latentUv。
   * 乘上畫面短邊，讓不同解析度的顆粒尺寸較穩定。
   */
  vec2 fieldPixel =
    uv * uResolution.y;

  /*
   * 緩慢變化的局部方向。
   * 不讓整個畫面所有纖維朝向一致。
   */
  float angle =
    valueNoise(
      uv * 1.7 +
      vec2(24.6, -7.3)
    ) * 6.28318530718;

  vec2 oriented =
    rotate2d(angle) *
    fieldPixel;

  /*
   * 兩個尺度：
   * coarse 是細長的內部纖維，
   * fine 是更小的材料顆粒。
   */
  float coarse =
    valueNoise(
      oriented *
      vec2(0.018, 0.075)
    );

  float fine =
    valueNoise(
      oriented *
      vec2(0.075, 0.23) +
      vec2(17.4, 9.8)
    );

  float structure =
    coarse * 0.68 +
    fine * 0.32;

  /*
   * 平靜時仍有一點，
   * 顯影時才稍微增強。
   */
  float strength =
    0.022 +
    reveal * 0.038;

  return
    (structure - 0.5) *
    strength;
}

/*
 * 離散參照物。
 *
 * 刻意混合圓點與短線，避免整體直接被讀成星空。
 * 它們本身不閃爍；位移主要由膜的形變產生。
 */
float latentMarkLayer(
  vec2 uv,
  float scale,
  float threshold,
  float seed
) {
  vec2 grid = uv * scale;
  vec2 cell = floor(grid);
  vec2 local = fract(grid) - 0.5;

  float existence =
    hash21(cell + seed);

  vec2 offset =
    vec2(
      hash21(cell + seed + 12.7),
      hash21(cell + seed + 83.1)
    ) - 0.5;

  local -= offset * 0.62;

  float angle =
    hash21(cell + seed + 51.3) *
    6.28318530718;

  vec2 rotated =
    rotate2d(angle) * local;

  float dotMark =
    1.0 -
    smoothstep(
      0.018,
      0.072,
      length(local)
    );

  float dashMark =
    (
      1.0 -
      smoothstep(
        0.012,
        0.042,
        abs(rotated.y)
      )
    ) *
    (
      1.0 -
      smoothstep(
        0.09,
        0.22,
        abs(rotated.x)
      )
    );

  float kind =
    hash21(cell + seed + 91.4);

  float mark =
    mix(
      dotMark,
      dashMark,
      step(0.72, kind)
    );

  float brightness =
    mix(
      0.28,
      1.0,
      hash21(cell + seed + 31.7)
    );

  return
    mark *
    step(threshold, existence) *
    brightness;
}

/*
 * 場內部的方向脈絡。
 *
 * 它不是固定直線，而是由低頻方向場扭曲。
 * 平靜時幾乎看不到，只在 reveal 提高時浮出。
 */
float latentFibres(vec2 uv) {
  float directionNoise =
    valueNoise(
      uv * 0.78 +
      vec2(7.3, 19.1)
    );

  float angle =
    directionNoise *
    6.28318530718;

  vec2 direction =
    vec2(cos(angle), sin(angle));

  vec2 perpendicular =
    vec2(-direction.y, direction.x);

  float phaseWarp =
    fbm(
      uv * 2.8 +
      vec2(21.4, -8.2)
    );

  float phase =
    dot(uv, direction) * 43.0 +
    dot(uv, perpendicular) * 4.5 +
    phaseWarp * 6.5;

  float ribbons =
    1.0 -
    smoothstep(
      0.055,
      0.24,
      abs(sin(phase))
    );

  float region =
    smoothstep(
      0.43,
      0.76,
      fbm(
        uv * 1.75 +
        vec2(-14.2, 33.7)
      )
    );

  return ribbons * region;
}

void main() {
  vec3 normal =
    normalize(vNormal);

  float slope =
    length(normal.xy);

  /*
   * geometrySignal：
   * 真實表面是否正在明顯彎曲。
   */
  float geometrySignal =
    clamp(
      max(
        vCurvature,
        slope * 1.35
      ),
      0.0,
      1.0
    );

  /*
   * revealSignal：
   * 結合目前幾何與既有 reveal 系統。
   */
  float revealSignal =
    clamp(
      vPresence * 0.82 +
      geometrySignal * 0.72,
      0.0,
      1.0
    );

  float reveal =
    smoothstep(
      0.10,
      0.72,
      revealSignal
    );

  /*
   * 在等比例空間中取樣。
   *
   * 潛在場本身不移動；
   * 是膜改變我們看見場的位置。
   */
  float distortion =
    uNormalDistortion *
    (
      0.28 +
      geometrySignal * 1.35 +
      vPresence * 0.55
    );

  vec2 fieldUv =
    vec2(
      vUv.x * uAspect,
      vUv.y
    ) +
    normal.xy * distortion;

  /*
   * 靜態 domain warp。
   *
   * 用途是破壞明顯噪聲塊，不負責動畫。
   */
  vec2 domainWarp =
    vec2(
      fbm(
        fieldUv * 1.12 +
        vec2(8.1, 2.4)
      ),
      fbm(
        fieldUv * 1.12 +
        vec2(19.7, 13.8)
      )
    ) - 0.5;

  vec2 latentUv =
    fieldUv +
    domainWarp * 0.24;

  /*
   * 低頻與中頻密度共同形成潛在場。
   */
  float broadDensity =
    fbm(
      latentUv * 1.18 +
      vec2(31.7, 18.4)
    );

  float middleDensity =
    fbm(
      latentUv * 3.25 +
      vec2(-12.2, 43.8)
    );

  float density =
    clamp(
      broadDensity * 0.72 +
      middleDensity * 0.28 +
      /*
       * 反覆被張力波前經過的區域，介質稍微濃一點——
       * 是疤痕的暗示，不是新的圖層。
       */
      vLegacy * 0.18,
      0.0,
      1.0
    );

  /*
   * 背景不是黑底加星雲，而是密度不同的同一介質。
   */
  vec3 deepColor =
    uBackgroundColor * 0.62;

  vec3 denseColor =
    mix(
      uBackgroundColor,
      uMembraneColor,
      0.18
    ) * 1.08;

  vec3 color =
    mix(
      deepColor,
      denseColor,
      smoothstep(
        0.18,
        0.88,
        density
      )
    );

    float microstructure =
      latentMicrostructure(
        latentUv,
        reveal
      );

    color *=
      1.0 +
      microstructure;

  /*
   * 離散參照物。
   *
   * 細層數量較多但很暗；
   * 稀疏層較亮，提供少量視覺焦點。
   */
  float fineMarks =
    latentMarkLayer(
      latentUv,
      112.0,
      0.91,
      71.0
    );

  float sparseMarks =
    latentMarkLayer(
      latentUv,
      238.0,
      0.986,
      19.0
    );

  float marks =
    fineMarks * 0.34 +
    sparseMarks * 0.92;

  float markVisibility =
    QUIET_MARKS +
    reveal * (1.0 - QUIET_MARKS) +
    vLegacy * 0.1;

  vec3 markColor =
    mix(
      uMembraneColor,
      uCoolStarColor,
      0.72
    );

  color +=
    markColor *
    marks *
    markVisibility *
    (
      0.52 +
      density * 0.48
    );

  /*
   * 方向脈絡只有在場被顯影時浮出。
   */
  float fibres =
    latentFibres(latentUv);

  float fibreVisibility =
    reveal *
    smoothstep(
      0.28,
      0.82,
      density
    );

  vec3 fibreColor =
    mix(
      uMembraneColor,
      uCoolStarColor,
      0.34
    );

  color +=
    fibreColor *
    fibres *
    fibreVisibility *
    FIBRE_GAIN *
    (
      0.55 +
      geometrySignal * 0.75
    );

  /*
   * 膜本身不畫成完整透明物體。
   * 只有斜面、曲率與顯影事件留下薄薄的冷光。
   */
  float fresnel =
    pow(
      1.0 -
      clamp(
        abs(normal.z),
        0.0,
        1.0
      ),
      2.35
    );

  float light =
    clamp(
      dot(
        normal,
        normalize(
          vec3(-0.4, -0.28, 0.87)
        )
      ) * 0.5 + 0.5,
      0.0,
      1.0
    );

  float surfacePresence =
    (
      fresnel * 0.30 +
      geometrySignal * 0.13
    ) *
    (
      0.16 +
      reveal * 0.84
    );

  vec3 surfaceColor =
    mix(
      uMembraneColor,
      uCoolStarColor,
      0.26
    );

  color +=
    surfaceColor *
    surfacePresence *
    mix(
      0.48,
      0.94,
      light
    );

  /*
   * 暖色不常駐。
   * 只在 reveal 與幾何同時很強時，讓少量離散痕跡變暖。
   */
  float eventEnergy =
    smoothstep(
      0.62,
      0.98,
      revealSignal
    );

  float eventMarks =
    latentMarkLayer(
      latentUv + vec2(11.8, -4.3),
      148.0,
      0.991,
      43.0
    );

  color +=
    uWarmStarColor *
    eventMarks *
    eventEnergy *
    WARM_EVENT_GAIN;

  /*
   * 輕微暗角，避免像一張平鋪程序紋理。
   */
  vec2 centered =
    (vUv - 0.5) *
    vec2(uAspect, 1.0);

  float vignette =
    smoothstep(
      0.34,
      0.94,
      length(centered)
    );

  color *=
    1.0 -
    vignette * 0.25;

  /*
   * 靜態顆粒只負責消除數位平滑感。
   */
  float grain =
    hash21(gl_FragCoord.xy);

  color *=
    0.992 +
    grain * 0.016;

  gl_FragColor =
    vec4(color, 1.0);
}