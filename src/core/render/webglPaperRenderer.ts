import type { Renderer } from "../contracts";
import { clamp, parseColor } from "../math";
import type { SimulationState, TopologyState } from "../state";
import type { Viewport } from "../types";

/**
 * Per-pixel paper renderer. The triangle mesh is only a skeleton: normals
 * are smoothed per vertex (split across crease edges so folds stay sharp)
 * and interpolated per pixel in the fragment shader, where lighting,
 * fiber grain, contact shadow, and sheen are computed.
 */

const VERTEX_SHADER = `
attribute vec2 aPosition;
attribute vec3 aNormal;
attribute float aOcclusion;

uniform vec2 uResolution;

varying vec3 vNormal;
varying float vOcclusion;
varying vec2 vUv;

void main() {
  vec2 clip = (aPosition / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vNormal = aNormal;
  vOcclusion = aOcclusion;
  vUv = aPosition / uResolution;
}
`;

const FRAGMENT_SHADER = `
precision highp float;

varying vec3 vNormal;
varying float vOcclusion;
varying vec2 vUv;

uniform vec3 uLight;
uniform vec3 uLitColor;
uniform vec3 uShadowColor;
uniform vec2 uFalloffDirection;
uniform vec2 uResolution;
uniform float uAspect;
uniform float uGrain;
uniform float uSheen;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  vec3 n = normalize(vNormal);

  float lambert = dot(n, uLight);
  float shade = clamp((lambert - 0.35) * 1.7, 0.0, 1.0);

  // A lamp never lights a sheet evenly: broad falloff toward the light.
  float falloff = clamp(
    0.5 + dot((vUv - 0.5) * vec2(uAspect, 1.0), uFalloffDirection) * 0.9,
    0.0, 1.0
  );
  shade *= 0.84 + falloff * 0.3;

  vec3 color = mix(uShadowColor, uLitColor, shade);

  // Satin sheen: paper is matte but not dead.
  vec3 halfVector = normalize(uLight + vec3(0.0, 0.0, 1.0));
  color += pow(max(dot(n, halfVector), 0.0), 24.0) * uSheen;

  // Anisotropic fiber grain, two octaves, static in screen space.
  vec2 pixel = vUv * uResolution;
  float grain =
    noise(pixel * vec2(0.32, 0.9)) * 0.6 +
    noise(pixel * vec2(1.7, 2.3)) * 0.4;
  color *= 1.0 + (grain - 0.5) * uGrain;

  // Contact shadow from local concavity (valleys, dents under the pointer).
  color *= vOcclusion;

  // Vignette.
  float centerDistance = distance(vUv * vec2(uAspect, 1.0), vec2(0.5 * uAspect, 0.5));
  color *= 1.0 - smoothstep(0.38, 1.05, centerDistance) * 0.34;

  gl_FragColor = vec4(color, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, kind: number, source: string): WebGLShader {
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

interface MeshBinding {
  topology: TopologyState;
  vertexCount: number;
  positions: Float32Array;
  normals: Float32Array;
  occlusions: Float32Array;
  /**
   * For each vertex (triangle corner): offset/count into smoothingGroups,
   * listing the triangle indices whose face normals average into it.
   */
  groupOffsets: Int32Array;
  groupCounts: Int32Array;
  smoothingGroups: Int32Array;
  cornerNodes: Int32Array;
  faceNormals: Float32Array;
  nodeOcclusion: Float32Array;
  nodeAverageEdge: Float32Array;
}

/**
 * How much vertex normals are smoothed toward neighbors (vs. kept flat per
 * facet). Paper facets stay slightly planar; 1.0 would read as soft cloth.
 */
const NORMAL_SMOOTHING = 0.78;

function buildMeshBinding(topology: TopologyState): MeshBinding {
  const { nodes, edges, triangles, creaseEdges } = topology;
  const vertexCount = triangles.length * 3;

  // Nodes that sit on a crease, with the crease direction through them.
  const creaseDirection = new Map<number, { x: number; y: number }>();
  for (const crease of creaseEdges) {
    const edge = edges[crease.edgeIndex];
    if (!edge) continue;
    const a = nodes[edge.nodeA]!;
    const b = nodes[edge.nodeB]!;
    const dx = b.restPosition.x - a.restPosition.x;
    const dy = b.restPosition.y - a.restPosition.y;
    for (const nodeIndex of [edge.nodeA, edge.nodeB]) {
      const existing = creaseDirection.get(nodeIndex);
      if (existing) {
        // Keep directions aligned before averaging so a straight chain
        // does not cancel itself.
        const flip = existing.x * dx + existing.y * dy < 0 ? -1 : 1;
        existing.x += dx * flip;
        existing.y += dy * flip;
      } else {
        creaseDirection.set(nodeIndex, { x: dx, y: dy });
      }
    }
  }

  const centroidSide = (triangleIndex: number, nodeIndex: number): number => {
    const direction = creaseDirection.get(nodeIndex)!;
    const triangle = triangles[triangleIndex]!;
    const node = nodes[nodeIndex]!;
    const a = nodes[triangle.nodeA]!;
    const b = nodes[triangle.nodeB]!;
    const c = nodes[triangle.nodeC]!;
    const centroidX =
      (a.restPosition.x + b.restPosition.x + c.restPosition.x) / 3 - node.restPosition.x;
    const centroidY =
      (a.restPosition.y + b.restPosition.y + c.restPosition.y) / 3 - node.restPosition.y;
    const cross = direction.x * centroidY - direction.y * centroidX;
    return cross >= 0 ? 1 : -1;
  };

  const groupOffsets = new Int32Array(vertexCount);
  const groupCounts = new Int32Array(vertexCount);
  const cornerNodes = new Int32Array(vertexCount);
  const groups: number[] = [];

  for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex += 1) {
    const triangle = triangles[triangleIndex]!;
    const corners = [triangle.nodeA, triangle.nodeB, triangle.nodeC];
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = triangleIndex * 3 + corner;
      const nodeIndex = corners[corner]!;
      cornerNodes[vertex] = nodeIndex;
      groupOffsets[vertex] = groups.length;

      const node = nodes[nodeIndex]!;
      if (!creaseDirection.has(nodeIndex)) {
        for (const adjacent of node.triangleIndices) groups.push(adjacent);
        groupCounts[vertex] = node.triangleIndices.length;
      } else {
        // Split the smoothing group across the crease line.
        const side = centroidSide(triangleIndex, nodeIndex);
        let count = 0;
        for (const adjacent of node.triangleIndices) {
          if (centroidSide(adjacent, nodeIndex) === side) {
            groups.push(adjacent);
            count += 1;
          }
        }
        if (count === 0) {
          groups.push(triangleIndex);
          count = 1;
        }
        groupCounts[vertex] = count;
      }
    }
  }

  const nodeAverageEdge = new Float32Array(nodes.length);
  for (const node of nodes) {
    let total = 0;
    for (const edgeIndex of node.edgeIndices) {
      total += edges[edgeIndex]?.baseRestLength ?? 0;
    }
    nodeAverageEdge[node.id] =
      node.edgeIndices.length > 0 ? total / node.edgeIndices.length : 1;
  }

  return {
    topology,
    vertexCount,
    positions: new Float32Array(vertexCount * 2),
    normals: new Float32Array(vertexCount * 3),
    occlusions: new Float32Array(vertexCount),
    groupOffsets,
    groupCounts,
    smoothingGroups: Int32Array.from(groups),
    cornerNodes,
    faceNormals: new Float32Array(triangles.length * 3),
    nodeOcclusion: new Float32Array(nodes.length),
    nodeAverageEdge,
  };
}

export function createWebglPaperRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: true,
    depth: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error("WebGL is not available.");

  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program.");
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(program) ?? "unknown"}`);
  }
  gl.useProgram(program);

  const attributes = {
    position: gl.getAttribLocation(program, "aPosition"),
    normal: gl.getAttribLocation(program, "aNormal"),
    occlusion: gl.getAttribLocation(program, "aOcclusion"),
  };
  const uniforms = {
    resolution: gl.getUniformLocation(program, "uResolution"),
    light: gl.getUniformLocation(program, "uLight"),
    litColor: gl.getUniformLocation(program, "uLitColor"),
    shadowColor: gl.getUniformLocation(program, "uShadowColor"),
    falloffDirection: gl.getUniformLocation(program, "uFalloffDirection"),
    aspect: gl.getUniformLocation(program, "uAspect"),
    grain: gl.getUniformLocation(program, "uGrain"),
    sheen: gl.getUniformLocation(program, "uSheen"),
  };

  const positionBuffer = gl.createBuffer();
  const normalBuffer = gl.createBuffer();
  const occlusionBuffer = gl.createBuffer();

  let viewport: Viewport = { width: 1, height: 1, devicePixelRatio: 1 };
  let mesh: MeshBinding | null = null;

  const uploadStatic = (): void => {
    if (!mesh) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, occlusionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.occlusions.byteLength, gl.DYNAMIC_DRAW);
  };

  const updateMesh = (state: Readonly<SimulationState>, depthProjection: number, occlusionStrength: number): void => {
    if (!mesh) return;
    const { nodes, triangles } = state.topology;
    const {
      positions, normals, occlusions, faceNormals,
      groupOffsets, groupCounts, smoothingGroups, cornerNodes,
      nodeOcclusion, nodeAverageEdge,
    } = mesh;

    // Face normals, flipped to point at the viewer.
    for (let index = 0; index < triangles.length; index += 1) {
      const normal = triangles[index]!.normal;
      const flip = normal.z < 0 ? -1 : 1;
      faceNormals[index * 3] = normal.x * flip;
      faceNormals[index * 3 + 1] = normal.y * flip;
      faceNormals[index * 3 + 2] = normal.z * flip;
    }

    // Contact shadow from the discrete Laplacian of z: a node sitting below
    // its neighbors is inside a valley or a fresh dent and gets darkened.
    const state_ = state as SimulationState;
    for (const node of state_.topology.nodes) {
      let neighborZ = 0;
      let count = 0;
      for (const edgeIndex of node.edgeIndices) {
        const edge = state_.topology.edges[edgeIndex];
        if (!edge) continue;
        const other = edge.nodeA === node.id ? edge.nodeB : edge.nodeA;
        neighborZ += state_.topology.nodes[other]!.position.z;
        count += 1;
      }
      if (count === 0) {
        nodeOcclusion[node.id] = 1;
        continue;
      }
      const laplacian = neighborZ / count - node.position.z;
      const concavity = clamp(laplacian / (nodeAverageEdge[node.id]! * 0.55));
      nodeOcclusion[node.id] = 1 - concavity * occlusionStrength;
    }

    for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex += 1) {
      const triangle = triangles[triangleIndex]!;
      const corners = [triangle.nodeA, triangle.nodeB, triangle.nodeC];
      const flatX = faceNormals[triangleIndex * 3]!;
      const flatY = faceNormals[triangleIndex * 3 + 1]!;
      const flatZ = faceNormals[triangleIndex * 3 + 2]!;

      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = triangleIndex * 3 + corner;
        const node = nodes[corners[corner]!]!;

        positions[vertex * 2] = node.position.x + node.position.z * depthProjection;
        positions[vertex * 2 + 1] =
          node.position.y - node.position.z * depthProjection * 0.72;

        let smoothX = 0;
        let smoothY = 0;
        let smoothZ = 0;
        const offset = groupOffsets[vertex]!;
        const count = groupCounts[vertex]!;
        for (let member = 0; member < count; member += 1) {
          const face = smoothingGroups[offset + member]!;
          smoothX += faceNormals[face * 3]!;
          smoothY += faceNormals[face * 3 + 1]!;
          smoothZ += faceNormals[face * 3 + 2]!;
        }
        const smoothLength = Math.max(1e-6, Math.hypot(smoothX, smoothY, smoothZ));

        let x = (smoothX / smoothLength) * NORMAL_SMOOTHING + flatX * (1 - NORMAL_SMOOTHING);
        let y = (smoothY / smoothLength) * NORMAL_SMOOTHING + flatY * (1 - NORMAL_SMOOTHING);
        let z = (smoothZ / smoothLength) * NORMAL_SMOOTHING + flatZ * (1 - NORMAL_SMOOTHING);
        const length = Math.max(1e-6, Math.hypot(x, y, z));
        x /= length;
        y /= length;
        z /= length;

        normals[vertex * 3] = x;
        normals[vertex * 3 + 1] = y;
        normals[vertex * 3 + 2] = z;
        occlusions[vertex] = nodeOcclusion[cornerNodes[vertex]!]!;
      }
    }
  };

  return {
    resize(nextViewport, maximumDevicePixelRatio) {
      viewport = nextViewport;
      const pixelRatio = Math.min(
        Math.max(1, nextViewport.devicePixelRatio),
        maximumDevicePixelRatio,
      );
      canvas.width = Math.max(1, Math.round(nextViewport.width * pixelRatio));
      canvas.height = Math.max(1, Math.round(nextViewport.height * pixelRatio));
      canvas.style.width = `${nextViewport.width}px`;
      canvas.style.height = `${nextViewport.height}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    },

    render(state, config) {
      const settings = config.crease;
      if (!settings) return;
      if (state.topology.triangles.length === 0) return;

      if (!mesh || mesh.topology !== state.topology) {
        mesh = buildMeshBinding(state.topology);
        uploadStatic();
      }

      updateMesh(state, config.render.depthProjection, settings.valleyShadowStrength);

      const background = parseColor(config.render.colors.background);
      gl.clearColor(background.r / 255, background.g / 255, background.b / 255, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const light = config.render.lightDirection;
      const lightLength = Math.max(1e-6, Math.hypot(light.x, light.y, light.z));
      const lit = parseColor(settings.paperLit);
      const shadow = parseColor(settings.paperShadow);
      const falloffLength = Math.max(1e-6, Math.hypot(light.x, light.y));

      gl.uniform2f(uniforms.resolution, viewport.width, viewport.height);
      gl.uniform3f(
        uniforms.light,
        light.x / lightLength,
        light.y / lightLength,
        light.z / lightLength,
      );
      gl.uniform3f(uniforms.litColor, lit.r / 255, lit.g / 255, lit.b / 255);
      gl.uniform3f(uniforms.shadowColor, shadow.r / 255, shadow.g / 255, shadow.b / 255);
      gl.uniform2f(
        uniforms.falloffDirection,
        light.x / falloffLength,
        light.y / falloffLength,
      );
      gl.uniform1f(uniforms.aspect, viewport.width / Math.max(1, viewport.height));
      gl.uniform1f(uniforms.grain, settings.grainOpacity * 0.32);
      gl.uniform1f(uniforms.sheen, settings.ridgeLightStrength * 0.12);

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.positions);
      gl.enableVertexAttribArray(attributes.position);
      gl.vertexAttribPointer(attributes.position, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.normals);
      gl.enableVertexAttribArray(attributes.normal);
      gl.vertexAttribPointer(attributes.normal, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, occlusionBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.occlusions);
      gl.enableVertexAttribArray(attributes.occlusion);
      gl.vertexAttribPointer(attributes.occlusion, 1, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLES, 0, mesh.vertexCount);
    },

    dispose() {
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(normalBuffer);
      gl.deleteBuffer(occlusionBuffer);
      gl.deleteProgram(program);
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
