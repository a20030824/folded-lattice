import type { ContourConfig } from "../config";
import type { Renderer } from "../contracts";
import { clamp, hash01, mixRgb, parseColor, rgbString } from "../math";
import type { NodeState, SimulationState, TopologyState } from "../state";
import type { Viewport } from "../types";

interface ContourPalette {
  key: string;
  present: string;
  echoes: string[];
  fieldShades: string[];
}

interface ArchiveEntry {
  capturedAt: number;
  path: Path2D;
}

interface ContourMetrics {
  closedArea: number;
  closedLoops: number;
  totalCurvature: number;
  dominantClosedArea: number;
  dominantCenterX: number;
  dominantCenterY: number;
}

interface ContourResult {
  path: Path2D;
  metrics: ContourMetrics;
}

interface ChartMark {
  capturedAt: number;
  path: Path2D;
  score: number;
  cellKey: number;
}

interface ContourBuffers {
  topology: TopologyState;
  hardEdges: Uint8Array;
  edgeFirstSegment: Int32Array;
  edgeSecondSegment: Int32Array;
  segmentUsed: Uint8Array;
  segmentEdgeA: Int32Array;
  segmentEdgeB: Int32Array;
  segmentAX: Float64Array;
  segmentAY: Float64Array;
  segmentBX: Float64Array;
  segmentBY: Float64Array;
  crossingX: Float64Array;
  crossingY: Float64Array;
  crossingEdge: Int32Array;
  chainX: Float64Array;
  chainY: Float64Array;
  chainHard: Uint8Array;
}

function buildPalette(settings: ContourConfig): ContourPalette {
  const key = [
    settings.presentColor,
    settings.recentColor,
    settings.distantColor,
    settings.lowFieldColor,
    settings.highFieldColor,
    settings.echoCount,
  ].join("|");
  const recent = parseColor(settings.recentColor);
  const distant = parseColor(settings.distantColor);
  const echoes: string[] = [];
  const lowField = parseColor(settings.lowFieldColor);
  const highField = parseColor(settings.highFieldColor);
  const fieldShades: string[] = [];

  for (let index = 0; index < settings.echoCount; index += 1) {
    const recency = 1 - index / Math.max(1, settings.echoCount - 1);
    echoes.push(rgbString(mixRgb(distant, recent, recency)));
  }

  for (let index = 0; index < 16; index += 1) {
    fieldShades.push(rgbString(mixRgb(lowField, highField, index / 15)));
  }

  return { key, present: settings.presentColor, echoes, fieldShades };
}

function buildPaperTile(
  backgroundColor: string,
  grainOpacity: number,
  seed: number,
): HTMLCanvasElement {
  const size = 256;
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const tileContext = tile.getContext("2d")!;
  const image = tileContext.createImageData(size, size);
  const base = parseColor(backgroundColor);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pixel = y * size + x;
      const fine = hash01(pixel * 31 + seed);
      const fiber = hash01(y * 977 + Math.floor(x / 13) * 131 + seed * 3);
      const cloud = hash01(Math.floor(x / 24) * 71 + Math.floor(y / 9) * 193 + seed);
      const fleck = fiber > 0.982 ? 1 : 0;
      const variation =
        ((fine - 0.5) * 13 + (cloud - 0.5) * 5 + fleck * 7) * grainOpacity;
      image.data[pixel * 4] = Math.max(0, Math.min(255, base.r + variation + 1));
      image.data[pixel * 4 + 1] = Math.max(0, Math.min(255, base.g + variation));
      image.data[pixel * 4 + 2] = Math.max(0, Math.min(255, base.b + variation - 1));
      image.data[pixel * 4 + 3] = 255;
    }
  }

  tileContext.putImageData(image, 0, 0);
  return tile;
}

function createBuffers(topology: TopologyState): ContourBuffers {
  const segmentCapacity = topology.triangles.length;
  const chainCapacity = segmentCapacity + 2;
  const hardEdges = new Uint8Array(topology.edges.length);
  for (const crease of topology.creaseEdges) {
    if (crease.edgeIndex >= 0 && crease.edgeIndex < hardEdges.length) {
      hardEdges[crease.edgeIndex] = 1;
    }
  }

  return {
    topology,
    hardEdges,
    edgeFirstSegment: new Int32Array(topology.edges.length),
    edgeSecondSegment: new Int32Array(topology.edges.length),
    segmentUsed: new Uint8Array(segmentCapacity),
    segmentEdgeA: new Int32Array(segmentCapacity),
    segmentEdgeB: new Int32Array(segmentCapacity),
    segmentAX: new Float64Array(segmentCapacity),
    segmentAY: new Float64Array(segmentCapacity),
    segmentBX: new Float64Array(segmentCapacity),
    segmentBY: new Float64Array(segmentCapacity),
    crossingX: new Float64Array(3),
    crossingY: new Float64Array(3),
    crossingEdge: new Int32Array(3),
    chainX: new Float64Array(chainCapacity),
    chainY: new Float64Array(chainCapacity),
    chainHard: new Uint8Array(chainCapacity),
  };
}

function writeCrossing(
  a: NodeState,
  b: NodeState,
  edgeIndex: number,
  level: number,
  depthProjection: number,
  crossingX: Float64Array,
  crossingY: Float64Array,
  crossingEdge: Int32Array,
  crossingCount: number,
): number {
  if ((a.position.z < level) === (b.position.z < level)) return crossingCount;
  const difference = b.position.z - a.position.z;
  if (Math.abs(difference) < 1e-7) return crossingCount;

  const t = (level - a.position.z) / difference;
  crossingX[crossingCount] =
    a.position.x + (b.position.x - a.position.x) * t + level * depthProjection;
  crossingY[crossingCount] =
    a.position.y + (b.position.y - a.position.y) * t - level * depthProjection * 0.72;
  crossingEdge[crossingCount] = edgeIndex;
  return crossingCount + 1;
}

function appendSmoothChain(
  path: Path2D,
  buffers: ContourBuffers,
  pointCount: number,
  closed: boolean,
  metrics: ContourMetrics,
): void {
  const { chainX: x, chainY: y, chainHard: hard } = buffers;
  if (pointCount < 2) return;

  const uniqueCount = closed ? pointCount - 1 : pointCount;
  if (uniqueCount < 2) return;

  if (closed && uniqueCount >= 3) {
    let twiceArea = 0;
    let centroidX = 0;
    let centroidY = 0;
    for (let index = 0; index < uniqueCount; index += 1) {
      const next = (index + 1) % uniqueCount;
      const cross = x[index]! * y[next]! - x[next]! * y[index]!;
      twiceArea += cross;
      centroidX += (x[index]! + x[next]!) * cross;
      centroidY += (y[index]! + y[next]!) * cross;
    }
    const area = Math.abs(twiceArea) * 0.5;
    metrics.closedArea += area;
    metrics.closedLoops += 1;
    if (area > metrics.dominantClosedArea && Math.abs(twiceArea) > 1e-6) {
      metrics.dominantClosedArea = area;
      metrics.dominantCenterX = centroidX / (3 * twiceArea);
      metrics.dominantCenterY = centroidY / (3 * twiceArea);
    }
  }

  const curvatureStart = closed ? 0 : 1;
  const curvatureEnd = closed ? uniqueCount : uniqueCount - 1;
  for (let index = curvatureStart; index < curvatureEnd; index += 1) {
    const previous = (index - 1 + uniqueCount) % uniqueCount;
    const next = (index + 1) % uniqueCount;
    const incomingX = x[index]! - x[previous]!;
    const incomingY = y[index]! - y[previous]!;
    const outgoingX = x[next]! - x[index]!;
    const outgoingY = y[next]! - y[index]!;
    const denominator =
      Math.hypot(incomingX, incomingY) * Math.hypot(outgoingX, outgoingY);
    if (denominator < 1e-6) continue;
    metrics.totalCurvature += Math.acos(
      clamp(
        (incomingX * outgoingX + incomingY * outgoingY) / denominator,
        -1,
        1,
      ),
    );
  }

  if (!closed) {
    path.moveTo(x[0]!, y[0]!);
    for (let index = 1; index < uniqueCount - 1; index += 1) {
      if (hard[index]) {
        path.lineTo(x[index]!, y[index]!);
        continue;
      }
      const next = index + 1;
      path.quadraticCurveTo(
        x[index]!,
        y[index]!,
        (x[index]! + x[next]!) * 0.5,
        (y[index]! + y[next]!) * 0.5,
      );
    }
    path.lineTo(x[uniqueCount - 1]!, y[uniqueCount - 1]!);
    return;
  }

  let firstHard = -1;
  for (let index = 0; index < uniqueCount; index += 1) {
    if (hard[index]) {
      firstHard = index;
      break;
    }
  }

  if (firstHard < 0) {
    const last = uniqueCount - 1;
    path.moveTo((x[last]! + x[0]!) * 0.5, (y[last]! + y[0]!) * 0.5);
    for (let index = 0; index < uniqueCount; index += 1) {
      const next = (index + 1) % uniqueCount;
      path.quadraticCurveTo(
        x[index]!,
        y[index]!,
        (x[index]! + x[next]!) * 0.5,
        (y[index]! + y[next]!) * 0.5,
      );
    }
    path.closePath();
    return;
  }

  // Begin at a real fold crossing. Smooth portions remain fluid, but the
  // contour is forced through crease intersections without rounding them.
  path.moveTo(x[firstHard]!, y[firstHard]!);
  for (let step = 1; step <= uniqueCount; step += 1) {
    const index = (firstHard + step) % uniqueCount;
    if (step === uniqueCount || hard[index]) {
      path.lineTo(x[index]!, y[index]!);
      continue;
    }
    const next = (index + 1) % uniqueCount;
    path.quadraticCurveTo(
      x[index]!,
      y[index]!,
      (x[index]! + x[next]!) * 0.5,
      (y[index]! + y[next]!) * 0.5,
    );
  }
  path.closePath();
}

/**
 * Builds connected isoline chains once, then smooths only between folds.
 * A crease edge is a protected corner: the underlying lattice disappears,
 * while the folded origin of the surface remains legible.
 */
function buildContourPath(
  state: Readonly<SimulationState>,
  buffers: ContourBuffers,
  level: number,
  depthProjection: number,
): ContourResult {
  const { nodes, triangles } = state.topology;
  const {
    edgeFirstSegment,
    edgeSecondSegment,
    segmentUsed,
    segmentEdgeA,
    segmentEdgeB,
    segmentAX,
    segmentAY,
    segmentBX,
    segmentBY,
    crossingX,
    crossingY,
    crossingEdge,
    chainX,
    chainY,
    chainHard,
    hardEdges,
  } = buffers;
  edgeFirstSegment.fill(-1);
  edgeSecondSegment.fill(-1);
  segmentUsed.fill(0);

  let segmentCount = 0;

  const registerEdge = (edgeIndex: number, segmentIndex: number): void => {
    if (edgeFirstSegment[edgeIndex] === -1) edgeFirstSegment[edgeIndex] = segmentIndex;
    else edgeSecondSegment[edgeIndex] = segmentIndex;
  };

  for (const triangle of triangles) {
    const a = nodes[triangle.nodeA];
    const b = nodes[triangle.nodeB];
    const c = nodes[triangle.nodeC];
    if (!a || !b || !c) continue;
    let count = 0;
    count = writeCrossing(
      a,
      b,
      triangle.edgeA,
      level,
      depthProjection,
      crossingX,
      crossingY,
      crossingEdge,
      count,
    );
    count = writeCrossing(
      b,
      c,
      triangle.edgeB,
      level,
      depthProjection,
      crossingX,
      crossingY,
      crossingEdge,
      count,
    );
    if (count < 2) {
      count = writeCrossing(
        c,
        a,
        triangle.edgeC,
        level,
        depthProjection,
        crossingX,
        crossingY,
        crossingEdge,
        count,
      );
    }
    if (count < 2) continue;

    const edgeA = crossingEdge[0]!;
    const edgeB = crossingEdge[1]!;
    segmentEdgeA[segmentCount] = edgeA;
    segmentEdgeB[segmentCount] = edgeB;
    segmentAX[segmentCount] = crossingX[0]!;
    segmentAY[segmentCount] = crossingY[0]!;
    segmentBX[segmentCount] = crossingX[1]!;
    segmentBY[segmentCount] = crossingY[1]!;
    registerEdge(edgeA, segmentCount);
    registerEdge(edgeB, segmentCount);
    segmentCount += 1;
  }

  const path = new Path2D();
  const metrics: ContourMetrics = {
    closedArea: 0,
    closedLoops: 0,
    totalCurvature: 0,
    dominantClosedArea: 0,
    dominantCenterX: 0,
    dominantCenterY: 0,
  };

  const traceChain = (firstSegment: number, firstEdge: number): void => {
    let segment = firstSegment;
    let enterEdge = firstEdge;
    const startingEdge = firstEdge;
    let pointCount = 0;
    let closed = false;

    while (segment >= 0 && segment < segmentCount && !segmentUsed[segment]) {
      segmentUsed[segment] = 1;
      const entersAtA = segmentEdgeA[segment] === enterEdge;
      const exitEdge = entersAtA ? segmentEdgeB[segment]! : segmentEdgeA[segment]!;

      if (pointCount === 0) {
        chainX[0] = entersAtA ? segmentAX[segment]! : segmentBX[segment]!;
        chainY[0] = entersAtA ? segmentAY[segment]! : segmentBY[segment]!;
        chainHard[0] = hardEdges[enterEdge] ?? 0;
        pointCount = 1;
      }

      chainX[pointCount] = entersAtA ? segmentBX[segment]! : segmentAX[segment]!;
      chainY[pointCount] = entersAtA ? segmentBY[segment]! : segmentAY[segment]!;
      chainHard[pointCount] = hardEdges[exitEdge] ?? 0;
      pointCount += 1;

      const first = edgeFirstSegment[exitEdge] ?? -1;
      const second = edgeSecondSegment[exitEdge] ?? -1;
      const next = first === segment ? second : first;
      if (next < 0 || segmentUsed[next]) {
        closed = exitEdge === startingEdge;
        break;
      }
      enterEdge = exitEdge;
      segment = next;
    }

    appendSmoothChain(path, buffers, pointCount, closed, metrics);
  };

  // Open contours first, starting at a boundary crossing.
  for (let segment = 0; segment < segmentCount; segment += 1) {
    if (segmentUsed[segment]) continue;
    const edgeA = segmentEdgeA[segment]!;
    const edgeB = segmentEdgeB[segment]!;
    if (edgeSecondSegment[edgeA] === -1) traceChain(segment, edgeA);
    else if (edgeSecondSegment[edgeB] === -1) traceChain(segment, edgeB);
  }

  // Remaining segments are closed loops.
  for (let segment = 0; segment < segmentCount; segment += 1) {
    if (!segmentUsed[segment]) traceChain(segment, segmentEdgeA[segment]!);
  }

  return { path, metrics };
}

/**
 * The present is recomputed from the live surface. The past is not: each
 * contour is frozen into a ring buffer, so a hand-made island outlives the
 * dent that created it. This makes Archive a state, not a shader delay.
 */
export function createContourRenderer(canvas: HTMLCanvasElement): Renderer {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D is not available.");

  let viewport: Viewport = { width: 1, height: 1, devicePixelRatio: 1 };
  let palette: ContourPalette | null = null;
  let background: CanvasGradient | string = "#070a0e";
  let backgroundKey = "";
  let paperPattern: CanvasPattern | null = null;
  let paperKey = "";
  let buffers: ContourBuffers | null = null;
  let lastCaptureAt = Number.NEGATIVE_INFINITY;
  let lastChartMarkAt = Number.NEGATIVE_INFINITY;
  let lastFieldFrame = -1;
  let pointerWasDown = false;
  let interactionPending = false;
  let interactionStartedAt = Number.NEGATIVE_INFINITY;
  const archive: ArchiveEntry[] = [];
  const chartMarks: ChartMark[] = [];
  const fieldCanvas = document.createElement("canvas");
  const fieldContext = fieldCanvas.getContext("2d", { alpha: true })!;
  const fieldScale = 0.22;

  const clearArchive = (): void => {
    archive.length = 0;
    chartMarks.length = 0;
    lastCaptureAt = Number.NEGATIVE_INFINITY;
    lastChartMarkAt = Number.NEGATIVE_INFINITY;
    pointerWasDown = false;
    interactionPending = false;
    interactionStartedAt = Number.NEGATIVE_INFINITY;
  };

  const addChartMark = (
    path: Path2D,
    score: number,
    capturedAt: number,
    maximumCount: number,
    cellKey: number,
  ): void => {
    if (maximumCount <= 0) return;
    const mark = { capturedAt, path, score, cellKey };
    const sameCell = chartMarks.findIndex((entry) => entry.cellKey === cellKey);
    if (sameCell >= 0) {
      if (score > chartMarks[sameCell]!.score) chartMarks[sameCell] = mark;
      lastChartMarkAt = capturedAt;
      chartMarks.sort((a, b) => a.capturedAt - b.capturedAt);
      return;
    } else if (chartMarks.length < maximumCount) {
      chartMarks.push(mark);
    } else {
      let weakest = 0;
      for (let index = 1; index < chartMarks.length; index += 1) {
        if (chartMarks[index]!.score < chartMarks[weakest]!.score) weakest = index;
      }
      if (score <= chartMarks[weakest]!.score) return;
      chartMarks[weakest] = mark;
    }
    chartMarks.sort((a, b) => a.capturedAt - b.capturedAt);
    lastChartMarkAt = capturedAt;
  };

  const rebuildBackground = (backgroundColor: string, liftColor: string): void => {
    const key = `${viewport.width}x${viewport.height}|${backgroundColor}|${liftColor}`;
    if (key === backgroundKey) return;
    backgroundKey = key;
    const gradient = context.createRadialGradient(
      viewport.width * 0.28,
      viewport.height * 0.22,
      0,
      viewport.width * 0.45,
      viewport.height * 0.45,
      Math.hypot(viewport.width, viewport.height) * 0.78,
    );
    gradient.addColorStop(0, liftColor);
    gradient.addColorStop(0.52, backgroundColor);
    gradient.addColorStop(1, backgroundColor);
    background = gradient;
  };

  const rebuildPaper = (
    backgroundColor: string,
    grainOpacity: number,
    seed: number,
  ): void => {
    const key = `${backgroundColor}|${grainOpacity}|${seed}`;
    if (key === paperKey) return;
    paperKey = key;
    paperPattern = context.createPattern(
      buildPaperTile(backgroundColor, grainOpacity, seed),
      "repeat",
    );
  };

  const updateFieldWash = (
    state: Readonly<SimulationState>,
    colors: string[],
    minimumHeight: number,
    maximumHeight: number,
    depthProjection: number,
  ): void => {
    const span = Math.max(1e-6, maximumHeight - minimumHeight);
    const light = { x: -0.55, y: -0.4 };
    fieldContext.clearRect(
      0,
      0,
      fieldCanvas.width / fieldScale,
      fieldCanvas.height / fieldScale,
    );

    for (const triangle of state.topology.triangles) {
      const a = state.topology.nodes[triangle.nodeA];
      const b = state.topology.nodes[triangle.nodeB];
      const c = state.topology.nodes[triangle.nodeC];
      if (!a || !b || !c) continue;
      const height = (a.position.z + b.position.z + c.position.z) / 3;
      const foldLight =
        triangle.normal.x * light.x + triangle.normal.y * light.y;
      const tone = clamp((height - minimumHeight) / span + foldLight * 0.14);
      const shade = Math.min(colors.length - 1, Math.floor(tone * colors.length));
      fieldContext.fillStyle = colors[shade] ?? colors[0] ?? "#c8b99a";
      fieldContext.beginPath();
      fieldContext.moveTo(
        a.position.x + a.position.z * depthProjection,
        a.position.y - a.position.z * depthProjection * 0.72,
      );
      fieldContext.lineTo(
        b.position.x + b.position.z * depthProjection,
        b.position.y - b.position.z * depthProjection * 0.72,
      );
      fieldContext.lineTo(
        c.position.x + c.position.z * depthProjection,
        c.position.y - c.position.z * depthProjection * 0.72,
      );
      fieldContext.closePath();
      fieldContext.fill();
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
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.lineCap = "round";
      context.lineJoin = "round";
      backgroundKey = "";
      paperKey = "";
      paperPattern = null;
      fieldCanvas.width = Math.max(2, Math.ceil(nextViewport.width * fieldScale));
      fieldCanvas.height = Math.max(2, Math.ceil(nextViewport.height * fieldScale));
      fieldContext.setTransform(fieldScale, 0, 0, fieldScale, 0, 0);
      lastFieldFrame = -1;
      buffers = null;
      clearArchive();
    },

    render(state, config) {
      const settings = config.contour;
      if (!settings || state.topology.triangles.length === 0) return;
      if (!buffers || buffers.topology !== state.topology) {
        buffers = createBuffers(state.topology);
        clearArchive();
      }

      const nextPaletteKey = [
        settings.presentColor,
        settings.recentColor,
        settings.distantColor,
        settings.lowFieldColor,
        settings.highFieldColor,
        settings.echoCount,
      ].join("|");
      if (!palette || palette.key !== nextPaletteKey) palette = buildPalette(settings);
      rebuildBackground(config.render.colors.background, settings.backgroundLift);
      rebuildPaper(
        config.render.colors.background,
        settings.grainOpacity,
        config.topology.randomSeed,
      );

      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      context.fillStyle = paperPattern ?? config.render.colors.background;
      context.fillRect(0, 0, viewport.width, viewport.height);
      context.globalAlpha = 0.52;
      context.fillStyle = background;
      context.fillRect(0, 0, viewport.width, viewport.height);
      context.globalAlpha = 1;

      let minimumHeight = Number.POSITIVE_INFINITY;
      let maximumHeight = Number.NEGATIVE_INFINITY;
      for (const node of state.topology.nodes) {
        if (
          node.position.x < 0 ||
          node.position.x > viewport.width ||
          node.position.y < 0 ||
          node.position.y > viewport.height
        ) {
          continue;
        }
        minimumHeight = Math.min(minimumHeight, node.position.z);
        maximumHeight = Math.max(maximumHeight, node.position.z);
      }
      if (!Number.isFinite(minimumHeight) || !Number.isFinite(maximumHeight)) return;

      if (lastFieldFrame < 0 || state.time.frame - lastFieldFrame >= 3) {
        updateFieldWash(
          state,
          palette.fieldShades,
          minimumHeight,
          maximumHeight,
          config.render.depthProjection,
        );
        lastFieldFrame = state.time.frame;
      }
      context.save();
      context.imageSmoothingEnabled = true;
      context.globalAlpha = settings.fieldOpacity;
      context.filter = "blur(9px)";
      context.drawImage(fieldCanvas, 0, 0, viewport.width, viewport.height);
      context.restore();

      const centerLevel = (minimumHeight + maximumHeight) * 0.5;
      const configuredRange =
        Math.min(viewport.width, viewport.height) * settings.levelRangeRatio;
      const range = Math.min(
        configuredRange,
        Math.max(1, (maximumHeight - minimumHeight) * 0.46),
      );
      const angularSpeed = (Math.PI * 2) / settings.cycleSeconds;
      const presentLevel =
        centerLevel + Math.sin(state.time.elapsed * angularSpeed) * range;
      const current = buildContourPath(
        state,
        buffers,
        presentLevel,
        config.render.depthProjection,
      );
      const currentPath = current.path;
      const archiveDuration = settings.echoCount * settings.echoDelaySeconds;
      const spatialGrid = Math.max(1, Math.round(settings.legacySpatialGrid));

      if (state.pointer.isDown && !pointerWasDown) {
        interactionPending = true;
        interactionStartedAt = state.time.elapsed;
      }
      pointerWasDown = state.pointer.isDown;

      for (let index = chartMarks.length - 1; index >= 0; index -= 1) {
        if (
          state.time.elapsed - chartMarks[index]!.capturedAt >
          settings.legacyDurationSeconds
        ) {
          chartMarks.splice(index, 1);
        }
      }

      if (state.time.elapsed - lastCaptureAt >= settings.echoDelaySeconds) {
        archive.push({ capturedAt: state.time.elapsed, path: currentPath });
        lastCaptureAt = state.time.elapsed;

        const viewportArea = Math.max(1, viewport.width * viewport.height);
        const areaScore = clamp((current.metrics.closedArea / viewportArea) * 18);
        const loopScore = clamp(current.metrics.closedLoops / 4);
        const curvatureScore = clamp(current.metrics.totalCurvature / (Math.PI * 18));
        const shapeScore =
          areaScore * 0.58 + loopScore * 0.24 + curvatureScore * 0.18;
        const extremumScore =
          1 - Math.abs(Math.cos(state.time.elapsed * angularSpeed));
        const interactionReady =
          interactionPending &&
          state.time.elapsed - interactionStartedAt >= 0.35 &&
          current.metrics.closedLoops > 0 &&
          areaScore > 0.01;
        const markX = interactionReady
          ? state.pointer.position.x
          : current.metrics.dominantCenterX;
        const markY = interactionReady
          ? state.pointer.position.y
          : current.metrics.dominantCenterY;
        const cellX = Math.min(
          spatialGrid - 1,
          Math.max(0, Math.floor((markX / Math.max(1, viewport.width)) * spatialGrid)),
        );
        const cellY = Math.min(
          spatialGrid - 1,
          Math.max(0, Math.floor((markY / Math.max(1, viewport.height)) * spatialGrid)),
        );
        const cellKey = cellY * spatialGrid + cellX;

        if (interactionReady) {
          addChartMark(
            currentPath,
            1.15 + areaScore * 0.25 + loopScore * 0.1,
            state.time.elapsed,
            settings.legacyCount,
            cellKey,
          );
          interactionPending = false;
        } else if (
          state.time.elapsed - interactionStartedAt > 4 &&
          interactionPending
        ) {
          interactionPending = false;
        } else if (state.time.elapsed - lastChartMarkAt >= 8) {
          if (extremumScore > 0.965) {
            addChartMark(
              currentPath,
              0.78 + areaScore * 0.12 + loopScore * 0.08,
              state.time.elapsed,
              settings.legacyCount,
              cellKey,
            );
          } else if (shapeScore > 0.72) {
            addChartMark(
              currentPath,
              shapeScore,
              state.time.elapsed,
              settings.legacyCount,
              cellKey,
            );
          }
        }
      }
      while (
        archive.length > settings.echoCount ||
        (archive[0] && state.time.elapsed - archive[0].capturedAt > archiveDuration)
      ) {
        archive.shift();
      }

      const opacity = config.render.edgeOpacity;
      context.strokeStyle = settings.legacyColor;
      for (const mark of chartMarks) {
        const age = Math.max(0, state.time.elapsed - mark.capturedAt);
        const ageRatio = clamp(age / Math.max(0.001, settings.legacyDurationSeconds));
        context.lineWidth = settings.legacyWidth * (1 + ageRatio * 0.16);
        context.globalAlpha =
          settings.legacyOpacity *
          (0.24 + Math.pow(1 - ageRatio, 1.35) * 0.76);
        context.stroke(mark.path);
      }

      for (const entry of archive) {
        const age = Math.max(0, state.time.elapsed - entry.capturedAt);
        const life = Math.max(0, 1 - age / Math.max(0.001, archiveDuration));
        const colorIndex = Math.min(
          settings.echoCount - 1,
          Math.max(0, Math.floor(age / settings.echoDelaySeconds)),
        );
        context.strokeStyle = palette.echoes[colorIndex] ?? settings.distantColor;
        context.lineWidth = settings.echoWidth * (0.78 + life * 0.22);
        context.globalAlpha = opacity * (0.075 + life * life * 0.35);
        context.stroke(entry.path);
      }

      context.strokeStyle = settings.highFieldColor;
      context.lineWidth = settings.presentWidth * 4.2;
      context.globalAlpha = opacity * 0.11;
      context.stroke(currentPath);
      context.strokeStyle = palette.present;
      context.lineWidth = settings.presentWidth;
      context.globalAlpha = opacity * 0.94;
      context.stroke(currentPath);
      context.globalAlpha = 1;
    },

    dispose() {
      clearArchive();
      buffers = null;
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
