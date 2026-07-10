import Delaunator from "delaunator";

import type { CreaseConfig, CreaseLifeConfig, FoldedLatticeConfig } from "../config";
import type {
  CreaseEdgeState,
  CreaseFieldState,
  CreaseState,
  EdgeState,
  NodeState,
  TopologyState,
  TriangleState,
} from "../state";
import type { Viewport } from "../types";
import { clamp, createRandom, hash01, smoothstep, valueNoise2D } from "../math";

interface CreaseNodeTag {
  creaseId: number;
  sequence: number;
}

interface WalkBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const fallbackCrease: CreaseConfig = {
  majorCount: 3,
  minorCount: 7,
  amplitudeRatio: 0.045,
  majorWidthRatio: 0.11,
  minorWidthRatio: 0.065,
  creaseSpacingRatio: 0.032,
  nearDensityRatio: 0.034,
  farDensityRatio: 0.095,
  densityFalloffRatio: 0.24,
  grainOpacity: 0.05,
  valleyShadowStrength: 0.5,
  ridgeLightStrength: 0.5,
  paperLit: "#3b372e",
  paperShadow: "#15130f",
  ridgeColor: "#eadfc7",
  shadowTint: "#242b3a",
  curliness: 0.02,
};

/**
 * Walks a fold line: near-straight, but with a per-crease curvature and a
 * bounded wander. Real creases are set by a hand, not a ruler.
 */
export function walkCreasePoints(
  startX: number,
  startY: number,
  directionX: number,
  directionY: number,
  maximumLength: number,
  step: number,
  wander: number,
  curvature: number,
  bounds: WalkBounds,
  random: () => number,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  let dx = directionX;
  let dy = directionY;
  let x = startX;
  let y = startY;
  let offset = 0;

  for (let travelled = 0; travelled <= maximumLength; travelled += step) {
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) {
      break;
    }
    offset += (random() - 0.5) * wander;
    offset = clamp(offset, -wander * 3, wander * 3);
    points.push({ x: x - dy * offset, y: y + dx * offset });

    const cos = Math.cos(curvature);
    const sin = Math.sin(curvature);
    const nextDx = dx * cos - dy * sin;
    const nextDy = dx * sin + dy * cos;
    dx = nextDx;
    dy = nextDy;
    x += dx * step;
    y += dy * step;
  }

  return points;
}

export function buildCreaseState(
  id: number,
  kind: "major" | "minor",
  sign: 1 | -1,
  strength: number,
  widthRatio: number,
  rawPoints: { x: number; y: number }[],
  shortSide: number,
  growth: number,
  fadePerSecond: number,
): CreaseState {
  let totalLength = 0;
  const lengths: number[] = [0];
  for (let index = 1; index < rawPoints.length; index += 1) {
    totalLength += Math.hypot(
      rawPoints[index]!.x - rawPoints[index - 1]!.x,
      rawPoints[index]!.y - rawPoints[index - 1]!.y,
    );
    lengths.push(totalLength);
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of rawPoints) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const influence = widthRatio * shortSide;

  return {
    id,
    kind,
    sign,
    points: rawPoints.map((point, index) => ({
      x: point.x,
      y: point.y,
      arc: totalLength > 0 ? lengths[index]! / totalLength : 0,
    })),
    widthRatio,
    targetWidthRatio: widthRatio,
    maturitySeconds: 0,
    strength,
    growth,
    growthPerSecond: 0,
    fadePerSecond,
    age: 0,
    // Inflate by 1.5x so a fresh, still-wide fold never escapes its box.
    minX: minX - influence * 1.5,
    minY: minY - influence * 1.5,
    maxX: maxX + influence * 1.5,
    maxY: maxY + influence * 1.5,
  };
}

/**
 * Signed height of the sheet at a point, from the current state of every
 * crease (strength and tip growth included) plus a faint static undulation.
 * Linear tents keep the surface piecewise planar - facets stay facets.
 */
export function evaluateCreaseField(
  x: number,
  y: number,
  field: CreaseFieldState,
): number {
  let height = 0;

  for (const crease of field.creases) {
    if (crease.strength <= 0.001 || crease.growth <= 0.001) continue;
    if (x < crease.minX || x > crease.maxX || y < crease.minY || y > crease.maxY) {
      continue;
    }

    let nearestSquared = Number.POSITIVE_INFINITY;
    let nearestTaper = 0;
    for (const point of crease.points) {
      if (point.arc > crease.growth) break;
      const dx = x - point.x;
      const dy = y - point.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < nearestSquared) {
        nearestSquared = distanceSquared;
        // The advancing tip eases in instead of popping.
        nearestTaper = clamp((crease.growth - point.arc) / 0.12);
      }
    }
    if (!Number.isFinite(nearestSquared)) continue;

    const width = field.shortSide * crease.widthRatio;
    const tent = 1 - Math.sqrt(nearestSquared) / width;
    if (tent <= 0) continue;
    height += crease.sign * crease.strength * field.amplitude * tent * nearestTaper;
  }

  const wave =
    (valueNoise2D(
      (x / field.shortSide) * 2.3 + field.waveSeed * 0.001,
      (y / field.shortSide) * 2.3,
    ) -
      0.5) *
    field.amplitude *
    0.18;

  return clamp(height, -field.amplitude * 1.2, field.amplitude * 1.2) + wave;
}

function localDirection(
  points: { x: number; y: number }[],
  index: number,
): { x: number; y: number } {
  const before = points[Math.max(0, index - 1)]!;
  const after = points[Math.min(points.length - 1, index + 1)]!;
  const length = Math.max(1e-6, Math.hypot(after.x - before.x, after.y - before.y));
  return { x: (after.x - before.x) / length, y: (after.y - before.y) / length };
}

function generateCreaseField(
  viewport: Viewport,
  settings: CreaseConfig,
  life: CreaseLifeConfig | undefined,
  seed: number,
): CreaseFieldState {
  const random = createRandom(seed ^ 0x9e3779b9);
  const shortSide = Math.min(viewport.width, viewport.height);
  // The sheet overshoots the viewport so no paper edge is ever visible.
  const overscan = shortSide * 0.16;
  const bounds: WalkBounds = {
    minX: -overscan,
    maxX: viewport.width + overscan,
    minY: -overscan,
    maxY: viewport.height + overscan,
  };
  const diagonal = Math.hypot(viewport.width, viewport.height);
  const step = shortSide * 0.05;
  const creases: CreaseState[] = [];

  const minorFade = (strength: number): number =>
    life?.enabled ? strength / (life.fadeSeconds * (0.75 + random() * 0.6)) : 0;

  for (let index = 0; index < settings.majorCount; index += 1) {
    const angle = random() * Math.PI;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const anchorX = viewport.width * (0.25 + random() * 0.5);
    const anchorY = viewport.height * (0.25 + random() * 0.5);
    const curvature = (random() - 0.5) * 2 * settings.curliness;

    // Walk both ways from the anchor so the fold crosses the whole sheet;
    // travelling backward along the same arc flips the curvature sign.
    const forward = walkCreasePoints(
      anchorX, anchorY, directionX, directionY,
      diagonal, step, shortSide * 0.006, curvature, bounds, random,
    );
    const backward = walkCreasePoints(
      anchorX, anchorY, -directionX, -directionY,
      diagonal, step, shortSide * 0.006, -curvature, bounds, random,
    );
    const points = [...backward.slice(1).reverse(), ...forward];
    if (points.length < 3) continue;

    creases.push(
      buildCreaseState(
        creases.length,
        "major",
        random() < 0.5 ? 1 : -1,
        0.8 + random() * 0.2,
        settings.majorWidthRatio,
        points,
        shortSide,
        1,
        0,
      ),
    );
  }

  // One or two crush zones where the sheet was gripped hardest.
  const crushZones: { x: number; y: number }[] = [];
  const zoneCount = 1 + (random() < 0.45 ? 1 : 0);
  for (let index = 0; index < zoneCount; index += 1) {
    crushZones.push({
      x: viewport.width * (0.2 + random() * 0.6),
      y: viewport.height * (0.2 + random() * 0.6),
    });
  }

  const spawnMinor = (
    originX: number,
    originY: number,
    parentDirection: { x: number; y: number },
    lengthScale: number,
    strengthBase: number,
  ): void => {
    const turn = (0.6 + random() * 0.9) * (random() < 0.5 ? 1 : -1);
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const directionX = parentDirection.x * cos - parentDirection.y * sin;
    const directionY = parentDirection.x * sin + parentDirection.y * cos;
    const length = shortSide * lengthScale * (0.7 + random() * 0.6);
    const curvature = (random() - 0.5) * 3 * settings.curliness;

    const points = walkCreasePoints(
      originX, originY, directionX, directionY,
      length, step * 0.8, shortSide * 0.008, curvature, bounds, random,
    );
    if (points.length < 2) return;

    const strength = strengthBase + random() * 0.25;
    const crease = buildCreaseState(
      creases.length,
      "minor",
      random() < 0.65 ? -1 : 1,
      strength,
      settings.minorWidthRatio,
      points,
      shortSide,
      1,
      minorFade(strength),
    );
    // Stagger ages so the initial folds do not all heal in one wave.
    crease.age = random() * (life?.fadeSeconds ?? 0) * 0.5;
    creases.push(crease);
  };

  const majorCount = creases.length;
  if (majorCount > 0) {
    // Most minor wrinkles radiate from the crush zones...
    const clustered = Math.max(0, settings.minorCount - 2);
    for (let index = 0; index < clustered; index += 1) {
      const zone = crushZones[index % crushZones.length]!;
      const parent = creases[Math.floor(random() * majorCount)]!;
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let p = 0; p < parent.points.length; p += 1) {
        const dx = parent.points[p]!.x - zone.x;
        const dy = parent.points[p]!.y - zone.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < nearestDistance) {
          nearestDistance = distanceSquared;
          nearestIndex = p;
        }
      }
      const jitter = shortSide * 0.09;
      const origin = parent.points[nearestIndex]!;
      spawnMinor(
        origin.x + (random() - 0.5) * jitter,
        origin.y + (random() - 0.5) * jitter,
        localDirection(parent.points, nearestIndex),
        0.22,
        0.4,
      );
    }

    // ...and a couple of strays keep the calm regions from being pristine.
    for (let index = 0; index < Math.min(2, settings.minorCount); index += 1) {
      const parent = creases[Math.floor(random() * majorCount)]!;
      const at = Math.floor(parent.points.length * (0.15 + random() * 0.7));
      spawnMinor(
        parent.points[at]!.x,
        parent.points[at]!.y,
        localDirection(parent.points, at),
        0.3,
        0.3,
      );
    }
  }

  return {
    creases,
    crushZones,
    shortSide,
    amplitude: shortSide * settings.amplitudeRatio,
    waveSeed: seed,
    nextCreaseId: creases.length,
  };
}

export const creaseTopologyBuilder = {
  build(viewport: Viewport, config: FoldedLatticeConfig): TopologyState {
    const settings = config.crease ?? fallbackCrease;
    const seed = config.topology.randomSeed;
    const random = createRandom(seed + 7717);
    const shortSide = Math.min(viewport.width, viewport.height);
    const overscan = shortSide * 0.16;
    const field = generateCreaseField(viewport, settings, settings.life, seed);
    const { creases, crushZones } = field;

    // Detail concentrates in the crush zones and relaxes to calm elsewhere.
    const zoneScaleAt = (x: number, y: number): number => {
      let nearestSquared = Number.POSITIVE_INFINITY;
      for (const zone of crushZones) {
        const dx = x - zone.x;
        const dy = y - zone.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < nearestSquared) nearestSquared = distanceSquared;
      }
      return 0.7 + 1.1 * smoothstep(0, shortSide * 0.55, Math.sqrt(nearestSquared));
    };

    // 1. Nodes along the crease lines, so mesh edges align with folds.
    const points: { x: number; y: number }[] = [];
    const creaseTags = new Map<number, CreaseNodeTag>();
    const baseSpacing = shortSide * settings.creaseSpacingRatio;

    for (const crease of creases) {
      let carried = 0;
      let sequence = 0;
      let previous = { x: crease.points[0]!.x, y: crease.points[0]!.y };
      const emit = (x: number, y: number): void => {
        for (let index = 0; index < points.length; index += 1) {
          const other = points[index]!;
          const dx = other.x - x;
          const dy = other.y - y;
          if (dx * dx + dy * dy < baseSpacing * baseSpacing * 0.3) {
            sequence += 1;
            return;
          }
        }
        creaseTags.set(points.length, { creaseId: crease.id, sequence });
        points.push({ x, y });
        sequence += 1;
      };

      emit(previous.x, previous.y);
      for (let index = 1; index < crease.points.length; index += 1) {
        const current = crease.points[index]!;
        const spacing = baseSpacing * zoneScaleAt(previous.x, previous.y);
        let segment = Math.hypot(current.x - previous.x, current.y - previous.y);
        while (carried + segment >= spacing) {
          const t = (spacing - carried) / segment;
          const x = previous.x + (current.x - previous.x) * t;
          const y = previous.y + (current.y - previous.y) * t;
          emit(x, y);
          previous = { x, y };
          segment = Math.hypot(current.x - previous.x, current.y - previous.y);
          carried = 0;
        }
        carried += segment;
        previous = { x: current.x, y: current.y };
      }
    }

    const creaseNodeCount = points.length;

    // 2. A deterministic ring outside the viewport guarantees the convex
    // hull always contains every corner - no background can ever show.
    const ringMinX = -overscan;
    const ringMaxX = viewport.width + overscan;
    const ringMinY = -overscan;
    const ringMaxY = viewport.height + overscan;
    for (let t = 0; t < 4; t += 1) {
      const fraction = t / 4;
      points.push({ x: ringMinX + (ringMaxX - ringMinX) * fraction, y: ringMinY });
      points.push({ x: ringMaxX, y: ringMinY + (ringMaxY - ringMinY) * fraction });
      points.push({ x: ringMaxX - (ringMaxX - ringMinX) * fraction, y: ringMaxY });
      points.push({ x: ringMinX, y: ringMaxY - (ringMaxY - ringMinY) * fraction });
    }

    // 3. Open-facet nodes: density decays away from creases and crush zones.
    const near = shortSide * settings.nearDensityRatio;
    const far = shortSide * settings.farDensityRatio;
    const falloff = shortSide * settings.densityFalloffRatio;
    const attempts = Math.max(4000, config.topology.nodeCount * 120);

    for (
      let attempt = 0;
      attempt < attempts && points.length < config.topology.nodeCount;
      attempt += 1
    ) {
      const x = -overscan + random() * (viewport.width + overscan * 2);
      const y = -overscan + random() * (viewport.height + overscan * 2);

      let creaseDistanceSquared = Number.POSITIVE_INFINITY;
      for (let index = 0; index < creaseNodeCount; index += 1) {
        const point = points[index]!;
        const dx = point.x - x;
        const dy = point.y - y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < creaseDistanceSquared) {
          creaseDistanceSquared = distanceSquared;
        }
      }
      const creaseDistance = Math.sqrt(creaseDistanceSquared);
      if (creaseDistance < near * 0.9) continue;

      const minimumDistance =
        (near + (far - near) * smoothstep(0, falloff, creaseDistance)) *
        zoneScaleAt(x, y);

      let fits = true;
      for (const point of points) {
        const dx = point.x - x;
        const dy = point.y - y;
        if (dx * dx + dy * dy < minimumDistance * minimumDistance) {
          fits = false;
          break;
        }
      }
      if (fits) points.push({ x, y });
    }

    if (points.length < 3) {
      return { nodes: [], edges: [], triangles: [], creaseEdges: [] };
    }

    // 3b. Relax open-facet nodes toward their neighbors: sparse regions
    // otherwise triangulate into long, oddly regular slivers. Crease and
    // ring nodes stay fixed so folds and coverage are untouched.
    const relaxStart = creaseNodeCount + 16;
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const relaxation = Delaunator.from(points, (point) => point.x, (point) => point.y);
      const sumX = new Float64Array(points.length);
      const sumY = new Float64Array(points.length);
      const neighborCounts = new Int32Array(points.length);
      const triangleIndices = relaxation.triangles;
      for (let index = 0; index < triangleIndices.length; index += 3) {
        const a = triangleIndices[index]!;
        const b = triangleIndices[index + 1]!;
        const c = triangleIndices[index + 2]!;
        for (const [from, to] of [[a, b], [b, c], [c, a], [b, a], [c, b], [a, c]] as const) {
          sumX[from] = (sumX[from] ?? 0) + points[to]!.x;
          sumY[from] = (sumY[from] ?? 0) + points[to]!.y;
          neighborCounts[from] = (neighborCounts[from] ?? 0) + 1;
        }
      }
      for (let index = relaxStart; index < points.length; index += 1) {
        const count = neighborCounts[index]!;
        if (count === 0) continue;
        const point = points[index]!;
        const targetX = point.x + (sumX[index]! / count - point.x) * 0.5;
        const targetY = point.y + (sumY[index]! / count - point.y) * 0.5;

        let creaseDistanceSquared = Number.POSITIVE_INFINITY;
        for (let creaseIndex = 0; creaseIndex < creaseNodeCount; creaseIndex += 1) {
          const creaseNode = points[creaseIndex]!;
          const dx = creaseNode.x - targetX;
          const dy = creaseNode.y - targetY;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < creaseDistanceSquared) {
            creaseDistanceSquared = distanceSquared;
          }
        }
        if (creaseDistanceSquared < near * near * 0.7) continue;

        point.x = clamp(targetX, -overscan, viewport.width + overscan);
        point.y = clamp(targetY, -overscan, viewport.height + overscan);
      }
    }

    // 4. Crumple the rest pose before edges exist, so rest lengths are 3D.
    const delaunay = Delaunator.from(points, (point) => point.x, (point) => point.y);
    const hullNodes = new Set<number>(delaunay.hull);
    const nodes: NodeState[] = points.map((point, id) => {
      const z = evaluateCreaseField(point.x, point.y, field);
      return {
        id,
        position: { x: point.x, y: point.y, z },
        previousPosition: { x: point.x, y: point.y, z },
        velocity: { x: 0, y: 0, z: 0 },
        force: { x: 0, y: 0, z: 0 },
        restPosition: { x: point.x, y: point.y, z },
        memoryOffset: { x: 0, y: 0, z: 0 },
        mass: 1,
        inverseMass: 1,
        pinned: config.topology.pinBoundary && hullNodes.has(id),
        edgeIndices: [],
        triangleIndices: [],
      };
    });

    const edges: EdgeState[] = [];
    const triangles: TriangleState[] = [];
    const creaseEdges: CreaseEdgeState[] = [];
    const edgeByNodes = new Map<string, number>();
    const edgeOwners = new Map<number, number[]>();

    const getEdge = (nodeA: number, nodeB: number): number => {
      const low = Math.min(nodeA, nodeB);
      const high = Math.max(nodeA, nodeB);
      const key = `${low}:${high}`;
      const existing = edgeByNodes.get(key);
      if (existing !== undefined) return existing;

      const id = edges.length;
      const a = nodes[low]!;
      const b = nodes[high]!;
      const restLength = Math.hypot(
        b.position.x - a.position.x,
        b.position.y - a.position.y,
        b.position.z - a.position.z,
      );
      edges.push({
        id,
        nodeA: low,
        nodeB: high,
        baseRestLength: restLength,
        restLength,
        currentLength: restLength,
        strain: 0,
        tension: 0,
        memory: 0,
        visibility: 0,
        highlight: 0,
        pulse: 0,
      });
      edgeByNodes.set(key, id);
      a.edgeIndices.push(id);
      b.edgeIndices.push(id);

      const tagA = creaseTags.get(low);
      const tagB = creaseTags.get(high);
      if (
        tagA &&
        tagB &&
        tagA.creaseId === tagB.creaseId &&
        Math.abs(tagA.sequence - tagB.sequence) <= 2
      ) {
        const crease = creases[tagA.creaseId]!;
        creaseEdges.push({
          edgeIndex: id,
          sign: crease.sign,
          strength: crease.strength,
          triangleA: -1,
          triangleB: -1,
        });
      }
      return id;
    };

    for (let index = 0; index < delaunay.triangles.length; index += 3) {
      const nodeA = delaunay.triangles[index];
      const nodeB = delaunay.triangles[index + 1];
      const nodeC = delaunay.triangles[index + 2];
      if (nodeA === undefined || nodeB === undefined || nodeC === undefined) continue;

      const edgeA = getEdge(nodeA, nodeB);
      const edgeB = getEdge(nodeB, nodeC);
      const edgeC = getEdge(nodeC, nodeA);
      const a = nodes[nodeA]!;
      const b = nodes[nodeB]!;
      const c = nodes[nodeC]!;
      const baseArea = Math.abs(
        (b.position.x - a.position.x) * (c.position.y - a.position.y) -
          (b.position.y - a.position.y) * (c.position.x - a.position.x),
      ) * 0.5;
      const id = triangles.length;

      triangles.push({
        id,
        nodeA,
        nodeB,
        nodeC,
        edgeA,
        edgeB,
        edgeC,
        center: {
          x: (a.position.x + b.position.x + c.position.x) / 3,
          y: (a.position.y + b.position.y + c.position.y) / 3,
          z: (a.position.z + b.position.z + c.position.z) / 3,
        },
        baseArea,
        currentArea: baseArea,
        normal: { x: 0, y: 0, z: 1 },
        foldValue: 0,
        memoryBias: 0,
        visibility: 1,
        phase: hash01(id * 31 + seed),
        neighborIndices: [],
      });

      a.triangleIndices.push(id);
      b.triangleIndices.push(id);
      c.triangleIndices.push(id);
      for (const edgeId of [edgeA, edgeB, edgeC]) {
        const owners = edgeOwners.get(edgeId) ?? [];
        owners.push(id);
        edgeOwners.set(edgeId, owners);
      }
    }

    for (const owners of edgeOwners.values()) {
      if (owners.length !== 2) continue;
      const first = owners[0];
      const second = owners[1];
      if (first === undefined || second === undefined) continue;
      triangles[first]!.neighborIndices.push(second);
      triangles[second]!.neighborIndices.push(first);
    }

    for (const creaseEdge of creaseEdges) {
      const owners = edgeOwners.get(creaseEdge.edgeIndex) ?? [];
      creaseEdge.triangleA = owners[0] ?? -1;
      creaseEdge.triangleB = owners[1] ?? -1;
    }

    return { nodes, edges, triangles, creaseEdges, creaseField: field };
  },
};
