import type { Renderer } from "../contracts";
import { clamp, parseColor } from "../math";
import type { SimulationState, TopologyState } from "../state";
import type { Viewport } from "../types";

const NORMAL_DISTORTION = 0.009;

const VERTEX_SHADER = `
attribute vec2 aPosition;
attribute vec3 aNormal;
attribute float aPresence;
attribute float aCurvature;

uniform vec2 uResolution;

varying vec2 vUv;
varying vec3 vNormal;
varying float vPresence;
varying float vCurvature;

void main() {
  vec2 clip = (aPosition / uResolution) * 2.0 - 1.0;

  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);

  vUv = aPosition / uResolution;
  vNormal = aNormal;
  vPresence = aPresence;
  vCurvature = aCurvature;
}
`;

const FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUv;
varying vec3 vNormal;
varying float vPresence;
varying float vCurvature;

uniform vec2 uResolution;
uniform float uAspect;
uniform float uTime;
uniform float uNormalDistortion;

uniform vec3 uBackgroundColor;
uniform vec3 uMembraneColor;
uniform vec3 uCoolStarColor;
uniform vec3 uWarmStarColor;


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


float starLayer(
  vec2 uv,
  float scale,
  float threshold,
  float seed,
  float time
) {
  vec2 grid = uv * scale;
  vec2 cell = floor(grid);
  vec2 local = fract(grid) - 0.5;

  float existence = hash21(cell + seed);
  vec2 offset = vec2(
    hash21(cell + seed + 12.7),
    hash21(cell + seed + 83.1)
  ) - 0.5;
  offset *= 0.65;

  float distanceToStar = length(local - offset);
  float point = smoothstep(0.075, 0.0, distanceToStar);
  float brightness = hash21(cell + seed + 31.7);
  float twinklePhase = hash21(cell + seed + 117.4) * 6.28318530718;
  float twinkle = 0.82 + 0.18 * sin(time * (0.35 + brightness * 0.75) + twinklePhase);

  return point * step(threshold, existence) * mix(0.24, 1.0, brightness) * twinkle;
}

vec2 lensFromWell(vec2 uv, vec4 well, float aspect) {
  if (well.z <= 0.0 || abs(well.w) <= 0.000001) {
    return vec2(0.0);
  }

  vec2 toward = well.xy - uv;
  vec2 metricToward = toward * vec2(aspect, 1.0);
  float distanceToWell = length(metricToward);
  float normalizedDistance = distanceToWell / max(well.z, 0.0001);

  float falloff = exp(-normalizedDistance * normalizedDistance * 2.2);
  vec2 metricDirection = metricToward / max(distanceToWell, 0.0001);
  vec2 uvDirection = vec2(metricDirection.x / aspect, metricDirection.y);

  return uvDirection * well.w * falloff;
}

void main() {
  vec3 normal = normalize(vNormal);

  float slope = length(normal.xy);
  float curvaturePresence = smoothstep(0.018, 0.3, max(slope, vCurvature));

  vec2 membraneOffset =
    vec2(normal.x / uAspect, normal.y) *
    uNormalDistortion *
    (0.2 + curvaturePresence * 1.5);



  vec2 starUv = vUv + membraneOffset ;
  vec2 starSpace = vec2(starUv.x * uAspect, starUv.y);

  // 大量極暗星塵：主要用途是讓空間扭曲有參照物
  float dustStars =
    starLayer(
      starSpace,
      105.0,
      0.90,
      71.0,
      uTime
    ) * 0.11;

  // 一般冷色星點
  float coolStars =
    starLayer(
      starSpace,
      175.0,
      0.962,
      4.0,
      uTime
    ) * 0.56;

  // 稀疏亮星
  float brightStars =
    starLayer(
      starSpace,
      410.0,
      0.991,
      19.0,
      uTime
    ) * 1.05;

  // 很少量暖色星
  float warmStars =
    starLayer(
      starSpace,
      255.0,
      0.995,
      43.0,
      uTime
    ) * 0.62;

  // 必須用被扭曲後的 starSpace。
  // 這樣暗霧與背景明暗也會一起被膜拉扯。
  vec2 driftingSpace = starSpace;

  // 大尺度深藍明暗變化
  float broadNoise =
    fbm(
      driftingSpace * 1.35 +
      vec2(31.7, 18.4)
    );

  // 較細的淡霧
  float nebulaNoise =
    fbm(
      driftingSpace * 3.1 +
      vec2(-12.2, 43.8)
    );

  float nebula =
    smoothstep(
      0.48,
      0.78,
      nebulaNoise
    );

  // 黑色不再完全均勻，讓引力扭曲有東西可以拉
  vec3 color =
    uBackgroundColor *
    mix(
      0.58,
      1.28,
      broadNoise
    );

  // 極淡冷色宇宙霧
  vec3 nebulaColor =
    mix(
      uMembraneColor,
      uCoolStarColor,
      0.38
    );

  color +=
    nebulaColor *
    nebula *
    0.105;

  // 星塵和一般星都使用冷色
  color +=
    uCoolStarColor *
    (
      dustStars +
      coolStars +
      brightStars
    );

  color +=
    uWarmStarColor *
    warmStars;

  float fresnel = pow(
    1.0 - clamp(abs(normal.z), 0.0, 1.0),
    2.6
  );

  float membranePresence =
    fresnel * 0.16 +
    curvaturePresence * 0.06 +
    clamp(vCurvature, 0.0, 1.0) * 0.07 +
    clamp(vPresence, 0.0, 1.0) * 0.055;

  float light = clamp(
    dot(normal, normalize(vec3(-0.4, -0.28, 0.87))) * 0.5 + 0.5,
    0.0,
    1.0
  );

  color +=
    uMembraneColor *
    membranePresence *
    mix(0.45, 1.0, light);

  float lensRing = 0.0;


  color += uMembraneColor * lensRing * 0.018;

  vec2 centered = (vUv - 0.5) * vec2(uAspect, 1.0);
  float vignette = smoothstep(0.28, 0.92, length(centered));
  color *= 1.0 - vignette * 0.34;

  float grain = hash21(gl_FragCoord.xy );
  color *=
    0.99 +
    grain *
    (
      0.01 +
      curvaturePresence * 0.015
    );

  gl_FragColor = vec4(color, 1.0);
}
`;

interface MeshBinding {
  topology: TopologyState;
  vertexCount: number;
  cornerNodes: Int32Array;
  positions: Float32Array;
  normals: Float32Array;
  presence: Float32Array;
  curvature: Float32Array;
  nodeNormals: Float32Array;
  nodePresence: Float32Array;
  nodeCurvature: Float32Array;
  nodeAverageEdge: Float32Array;
}

function compileShader(
  gl: WebGLRenderingContext,
  kind: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(kind);
  if (!shader) throw new Error("Failed to create shader.");

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log ?? "unknown"}`);
  }

  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();

  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error("Failed to create WebGL program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log ?? "unknown"}`);
  }

  return program;
}

function buildMeshBinding(topology: TopologyState): MeshBinding {
  const { nodes, edges, triangles } = topology;
  const vertexCount = triangles.length * 3;
  const cornerNodes = new Int32Array(vertexCount);

  for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex += 1) {
    const triangle = triangles[triangleIndex]!;
    const offset = triangleIndex * 3;
    cornerNodes[offset] = triangle.nodeA;
    cornerNodes[offset + 1] = triangle.nodeB;
    cornerNodes[offset + 2] = triangle.nodeC;
  }

  const nodeAverageEdge = new Float32Array(nodes.length);
  for (const node of nodes) {
    let total = 0;

    for (const edgeIndex of node.edgeIndices) {
      total += edges[edgeIndex]?.baseRestLength ?? 0;
    }

    nodeAverageEdge[node.id] =
      node.edgeIndices.length > 0
        ? total / node.edgeIndices.length
        : 1;
  }

  return {
    topology,
    vertexCount,
    cornerNodes,
    positions: new Float32Array(vertexCount * 2),
    normals: new Float32Array(vertexCount * 3),
    presence: new Float32Array(vertexCount),
    curvature: new Float32Array(vertexCount),
    nodeNormals: new Float32Array(nodes.length * 3),
    nodePresence: new Float32Array(nodes.length),
    nodeCurvature: new Float32Array(nodes.length),
    nodeAverageEdge,
  };
}

function updateMesh(
  binding: MeshBinding,
  state: Readonly<SimulationState>,
  depthProjection: number,
): void {
  const { nodes, edges, triangles } = state.topology;
  const {
    nodeNormals,
    nodePresence,
    nodeCurvature,
    nodeAverageEdge,
    cornerNodes,
    positions,
    normals,
    presence,
    curvature,
  } = binding;

  nodeNormals.fill(0);
  nodePresence.fill(0);
  nodeCurvature.fill(0);

  for (const triangle of triangles) {
    const flip = triangle.normal.z < 0 ? -1 : 1;
    const normalX = triangle.normal.x * flip;
    const normalY = triangle.normal.y * flip;
    const normalZ = triangle.normal.z * flip;
    const fold = Math.abs(triangle.foldValue + triangle.memoryBias);

    for (const nodeIndex of [triangle.nodeA, triangle.nodeB, triangle.nodeC]) {
      const offset = nodeIndex * 3;
      nodeNormals[offset] =
        (nodeNormals[offset] ?? 0) + normalX;

      nodeNormals[offset + 1] =
        (nodeNormals[offset + 1] ?? 0) + normalY;

      nodeNormals[offset + 2] =
        (nodeNormals[offset + 2] ?? 0) + normalZ;

      nodePresence[nodeIndex] =
        (nodePresence[nodeIndex] ?? 0) +
        triangle.visibility;

      nodeCurvature[nodeIndex] =
        (nodeCurvature[nodeIndex] ?? 0) + fold;
    }
  }

  for (const node of nodes) {
    const normalOffset = node.id * 3;
    let normalX = nodeNormals[normalOffset]!;
    let normalY = nodeNormals[normalOffset + 1]!;
    let normalZ = nodeNormals[normalOffset + 2]!;
    const normalLength = Math.max(
      0.000001,
      Math.hypot(normalX, normalY, normalZ),
    );

    normalX /= normalLength;
    normalY /= normalLength;
    normalZ /= normalLength;

    nodeNormals[normalOffset] = normalX;
    nodeNormals[normalOffset + 1] = normalY;
    nodeNormals[normalOffset + 2] = normalZ;

    const triangleCount = Math.max(1, node.triangleIndices.length);
    nodePresence[node.id] =
      (nodePresence[node.id] ?? 0) /
      triangleCount;

    nodeCurvature[node.id] =
      (nodeCurvature[node.id] ?? 0) /
      triangleCount;

    let neighborHeight = 0;
    let neighborCount = 0;

    for (const edgeIndex of node.edgeIndices) {
      const edge = edges[edgeIndex];
      if (!edge) continue;

      const neighborIndex = edge.nodeA === node.id ? edge.nodeB : edge.nodeA;
      const neighbor = nodes[neighborIndex];
      if (!neighbor) continue;

      neighborHeight += neighbor.position.z;
      neighborCount += 1;
    }

    const laplacian =
      neighborCount > 0
        ? neighborHeight / neighborCount - node.position.z
        : 0;

    const geometricCurvature =
      Math.abs(laplacian) /
      Math.max(1, nodeAverageEdge[node.id]! * 0.55);

    nodeCurvature[node.id] = clamp(
      geometricCurvature * 1.2 + nodeCurvature[node.id]! * 0.75,
    );
  }

  for (let vertex = 0; vertex < binding.vertexCount; vertex += 1) {
    const nodeIndex = cornerNodes[vertex]!;
    const node = nodes[nodeIndex]!;
    const normalOffset = nodeIndex * 3;

    positions[vertex * 2] =
      node.position.x + node.position.z * depthProjection;
    positions[vertex * 2 + 1] =
      node.position.y - node.position.z * depthProjection * 0.72;

    normals[vertex * 3] = nodeNormals[normalOffset]!;
    normals[vertex * 3 + 1] = nodeNormals[normalOffset + 1]!;
    normals[vertex * 3 + 2] = nodeNormals[normalOffset + 2]!;

    presence[vertex] = nodePresence[nodeIndex]!;
    curvature[vertex] = nodeCurvature[nodeIndex]!;
  }
}

function uploadAttribute(
  gl: WebGLRenderingContext,
  buffer: WebGLBuffer,
  location: number,
  values: Float32Array,
  size: number,
): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, values, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
}

function toRgb01(color: string, fallback: { r: number; g: number; b: number }) {
  const parsed = parseColor(color, fallback);
  return {
    r: parsed.r / 255,
    g: parsed.g / 255,
    b: parsed.b / 255,
  };
}

export function createWebglMembraneRenderer(
  canvas: HTMLCanvasElement,
): Renderer {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: true,
    depth: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });

  if (!gl) throw new Error("WebGL is not available.");

  const program = createProgram(gl);
  gl.useProgram(program);

  const attributes = {
    position: gl.getAttribLocation(program, "aPosition"),
    normal: gl.getAttribLocation(program, "aNormal"),
    presence: gl.getAttribLocation(program, "aPresence"),
    curvature: gl.getAttribLocation(program, "aCurvature"),
  };

  const uniforms = {
    resolution: gl.getUniformLocation(program, "uResolution"),
    aspect: gl.getUniformLocation(program, "uAspect"),
    time: gl.getUniformLocation(program, "uTime"),
    normalDistortion: gl.getUniformLocation(program, "uNormalDistortion"),
    backgroundColor: gl.getUniformLocation(program, "uBackgroundColor"),
    membraneColor: gl.getUniformLocation(program, "uMembraneColor"),
    coolStarColor: gl.getUniformLocation(program, "uCoolStarColor"),
    warmStarColor: gl.getUniformLocation(program, "uWarmStarColor"),
  };

  const positionBuffer = gl.createBuffer();
  const normalBuffer = gl.createBuffer();
  const presenceBuffer = gl.createBuffer();
  const curvatureBuffer = gl.createBuffer();

  if (!positionBuffer || !normalBuffer || !presenceBuffer || !curvatureBuffer) {
    gl.deleteProgram(program);
    throw new Error("Failed to create WebGL buffers.");
  }

  let viewport: Viewport = {
    width: 1,
    height: 1,
    devicePixelRatio: 1,
  };

  let mesh: MeshBinding | null = null;

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);

  

  return {
    resize(nextViewport, maximumDevicePixelRatio) {
      viewport = nextViewport;

      const pixelRatio = Math.min(
        Math.max(1, nextViewport.devicePixelRatio),
        maximumDevicePixelRatio,
      );

      canvas.width = Math.max(
        1,
        Math.round(nextViewport.width * pixelRatio),
      );
      canvas.height = Math.max(
        1,
        Math.round(nextViewport.height * pixelRatio),
      );
      canvas.style.width = `${nextViewport.width}px`;
      canvas.style.height = `${nextViewport.height}px`;

      gl.viewport(0, 0, canvas.width, canvas.height);
    },

    render(state, config) {
      if (state.topology.triangles.length === 0) return;

      if (!mesh || mesh.topology !== state.topology) {
        mesh = buildMeshBinding(state.topology);
      }

      updateMesh(mesh, state, config.render.depthProjection);

      const background = toRgb01(config.render.colors.background, {
        r: 5,
        g: 7,
        b: 13,
      });
      const membrane = toRgb01(config.render.colors.glow, {
        r: 56,
        g: 93,
        b: 120,
      });
      const coolStars = toRgb01(config.render.colors.edgeHighlight, {
        r: 217,
        g: 237,
        b: 242,
      });
      const warmStars = toRgb01(config.render.colors.pulse ?? "#e6d2a3", {
        r: 230,
        g: 210,
        b: 163,
      });

      gl.clearColor(background.r, background.g, background.b, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);

      uploadAttribute(
        gl,
        positionBuffer,
        attributes.position,
        mesh.positions,
        2,
      );
      uploadAttribute(
        gl,
        normalBuffer,
        attributes.normal,
        mesh.normals,
        3,
      );
      uploadAttribute(
        gl,
        presenceBuffer,
        attributes.presence,
        mesh.presence,
        1,
      );
      uploadAttribute(
        gl,
        curvatureBuffer,
        attributes.curvature,
        mesh.curvature,
        1,
      );

      gl.uniform2f(uniforms.resolution, viewport.width, viewport.height);
      gl.uniform1f(
        uniforms.aspect,
        viewport.width / Math.max(1, viewport.height),
      );
      gl.uniform1f(uniforms.time, state.time.elapsed);
      gl.uniform1f(uniforms.normalDistortion, NORMAL_DISTORTION);

      gl.uniform3f(
        uniforms.backgroundColor,
        background.r,
        background.g,
        background.b,
      );
      gl.uniform3f(
        uniforms.membraneColor,
        membrane.r,
        membrane.g,
        membrane.b,
      );
      gl.uniform3f(
        uniforms.coolStarColor,
        coolStars.r,
        coolStars.g,
        coolStars.b,
      );
      gl.uniform3f(
        uniforms.warmStarColor,
        warmStars.r,
        warmStars.g,
        warmStars.b,
      );



      gl.drawArrays(gl.TRIANGLES, 0, mesh.vertexCount);
    },

    dispose() {
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(normalBuffer);
      gl.deleteBuffer(presenceBuffer);
      gl.deleteBuffer(curvatureBuffer);
      gl.deleteProgram(program);

      canvas.width = 1;
      canvas.height = 1;
    },
  };
}