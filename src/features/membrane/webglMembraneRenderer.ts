import type { Renderer } from "../../core/contracts";
import { clamp, parseColor } from "../../core/math";
import type { SimulationState, TopologyState } from "../../core/state";
import type { Viewport } from "../../core/types";
import { pulseConfigKey } from "./config";
import { getMembraneLegacyRuntime } from "./state";
import vertexShaderSource
  from "./shaders/membrane.vert.glsl?raw";

import fragmentShaderSource
  from "./shaders/membrane.frag.glsl?raw";

const NORMAL_DISTORTION = 0.009;

interface MeshBinding {
  topology: TopologyState;
  vertexCount: number;
  cornerNodes: Int32Array;
  positions: Float32Array;
  normals: Float32Array;
  presence: Float32Array;
  curvature: Float32Array;
  legacy: Float32Array;
  nodeNormals: Float32Array;
  nodePresence: Float32Array;
  nodeCurvature: Float32Array;
  nodeLegacy: Float32Array;
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

function createProgram(
  gl: WebGLRenderingContext,
): WebGLProgram {
  const vertexShader = compileShader(
    gl,
    gl.VERTEX_SHADER,
    vertexShaderSource,
  );

  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentShaderSource,
  );

  const program = gl.createProgram();

  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    throw new Error(
      "Failed to create WebGL program.",
    );
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (
    !gl.getProgramParameter(
      program,
      gl.LINK_STATUS,
    )
  ) {
    const log =
      gl.getProgramInfoLog(program);

    gl.deleteProgram(program);

    throw new Error(
      `Program link failed: ${log ?? "unknown"}`,
    );
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
    legacy: new Float32Array(vertexCount),
    nodeNormals: new Float32Array(nodes.length * 3),
    nodePresence: new Float32Array(nodes.length),
    nodeCurvature: new Float32Array(nodes.length),
    nodeLegacy: new Float32Array(nodes.length),
    nodeAverageEdge,
  };
}

function updateMesh(
  binding: MeshBinding,
  state: Readonly<SimulationState>,
  depthProjection: number,
): void {
  const { nodes, edges, triangles } = state.topology;
  const legacyRuntime = getMembraneLegacyRuntime(state);
  const triangleLegacy =
    legacyRuntime?.triangleLegacy.length === triangles.length
      ? legacyRuntime.triangleLegacy
      : undefined;
  const {
    nodeNormals,
    nodePresence,
    nodeCurvature,
    nodeLegacy,
    nodeAverageEdge,
    cornerNodes,
    positions,
    normals,
    presence,
    curvature,
    legacy,
  } = binding;

  nodeNormals.fill(0);
  nodePresence.fill(0);
  nodeCurvature.fill(0);
  nodeLegacy.fill(0);

  for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex += 1) {
    const triangle = triangles[triangleIndex]!;
    const legacyValue = triangleLegacy?.[triangleIndex] ?? 0;
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

      nodeLegacy[nodeIndex] =
        (nodeLegacy[nodeIndex] ?? 0) + legacyValue;
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

    nodeLegacy[node.id] =
      (nodeLegacy[node.id] ?? 0) /
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
    legacy[vertex] = nodeLegacy[nodeIndex]!;
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
    legacy: gl.getAttribLocation(program, "aLegacy"),
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
  const legacyBuffer = gl.createBuffer();

  if (
    !positionBuffer ||
    !normalBuffer ||
    !presenceBuffer ||
    !curvatureBuffer ||
    !legacyBuffer
  ) {
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
      const warmStars = toRgb01(
        config.modules.get(pulseConfigKey)?.color ?? "#e6d2a3",
        {
          r: 230,
          g: 210,
          b: 163,
        },
      );

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
      uploadAttribute(
        gl,
        legacyBuffer,
        attributes.legacy,
        mesh.legacy,
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
      gl.deleteBuffer(legacyBuffer);
      gl.deleteProgram(program);

      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
