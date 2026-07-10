import Delaunator from "delaunator";

import type { FoldedLatticeConfig } from "../config";
import type {
  EdgeState,
  NodeState,
  TopologyState,
  TriangleState,
} from "../state";
import type { Viewport } from "../types";
import { createRandom } from "../math";

interface Point {
  x: number;
  y: number;
}

function samplePoissonPoints(
  viewport: Viewport,
  count: number,
  minimumDistance: number,
  margin: number,
  seed: number,
): Point[] {
  const random = createRandom(seed);
  const minimumX = margin;
  const maximumX = Math.max(margin + 1, viewport.width - margin);
  const minimumY = margin;
  const maximumY = Math.max(margin + 1, viewport.height - margin);
  const cellSize = minimumDistance / Math.SQRT2;
  const columns = Math.max(1, Math.ceil((maximumX - minimumX) / cellSize));
  const rows = Math.max(1, Math.ceil((maximumY - minimumY) / cellSize));
  const grid = new Int32Array(columns * rows).fill(-1);
  const points: Point[] = [];
  const minimumDistanceSquared = minimumDistance * minimumDistance;

  const gridIndex = (x: number, y: number): number => {
    const column = Math.min(columns - 1, Math.max(0, Math.floor((x - minimumX) / cellSize)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor((y - minimumY) / cellSize)));
    return row * columns + column;
  };

  const insert = (point: Point): void => {
    const index = points.length;
    points.push(point);
    grid[gridIndex(point.x, point.y)] = index;
  };

  const fits = (point: Point): boolean => {
    if (
      point.x < minimumX ||
      point.x > maximumX ||
      point.y < minimumY ||
      point.y > maximumY
    ) {
      return false;
    }

    const column = Math.floor((point.x - minimumX) / cellSize);
    const row = Math.floor((point.y - minimumY) / cellSize);

    for (let y = Math.max(0, row - 2); y <= Math.min(rows - 1, row + 2); y += 1) {
      for (
        let x = Math.max(0, column - 2);
        x <= Math.min(columns - 1, column + 2);
        x += 1
      ) {
        const pointIndex = grid[y * columns + x] ?? -1;
        if (pointIndex < 0) continue;
        const neighbor = points[pointIndex];
        if (!neighbor) continue;
        const dx = neighbor.x - point.x;
        const dy = neighbor.y - point.y;
        if (dx * dx + dy * dy < minimumDistanceSquared) return false;
      }
    }

    return true;
  };

  const maximumAttempts = count * 240;
  for (let attempt = 0; attempt < maximumAttempts && points.length < count; attempt += 1) {
    const candidate = {
      x: minimumX + random() * (maximumX - minimumX),
      y: minimumY + random() * (maximumY - minimumY),
    };
    if (fits(candidate)) insert(candidate);
  }

  return points;
}

function generatePoints(viewport: Viewport, config: FoldedLatticeConfig): Point[] {
  const shortSide = Math.min(viewport.width, viewport.height);
  const margin = shortSide * config.topology.marginRatio;
  const requestedDistance = shortSide * config.topology.minimumDistanceRatio;

  for (let pass = 0; pass < 5; pass += 1) {
    const points = samplePoissonPoints(
      viewport,
      config.topology.nodeCount,
      requestedDistance * 0.9 ** pass,
      margin,
      config.topology.randomSeed + pass * 997,
    );
    if (points.length >= config.topology.nodeCount || pass === 4) {
      return points.slice(0, config.topology.nodeCount);
    }
  }

  return [];
}

function distance(a: NodeState, b: NodeState): number {
  return Math.hypot(
    b.position.x - a.position.x,
    b.position.y - a.position.y,
    b.position.z - a.position.z,
  );
}

export const delaunayTopologyBuilder = {
  build(viewport: Viewport, config: FoldedLatticeConfig): TopologyState {
    const points = generatePoints(viewport, config);
    if (points.length < 3) {
      return { nodes: [], edges: [], triangles: [], creaseEdges: [] };
    }

    const delaunay = Delaunator.from(points, (point) => point.x, (point) => point.y);
    const hullNodes = new Set<number>(delaunay.hull);
    const nodes: NodeState[] = points.map((point, id) => ({
      id,
      position: { x: point.x, y: point.y, z: 0 },
      previousPosition: { x: point.x, y: point.y, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      force: { x: 0, y: 0, z: 0 },
      restPosition: { x: point.x, y: point.y, z: 0 },
      memoryOffset: { x: 0, y: 0, z: 0 },
      mass: 1,
      inverseMass: 1,
      pinned: config.topology.pinBoundary && hullNodes.has(id),
      edgeIndices: [],
      triangleIndices: [],
    }));

    const edges: EdgeState[] = [];
    const triangles: TriangleState[] = [];
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
      const restLength = distance(a, b);
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
        visibility: config.reveal.edgeBaseVisibility,
        highlight: 0,
      });
      edgeByNodes.set(key, id);
      a.edgeIndices.push(id);
      b.edgeIndices.push(id);
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
          z: 0,
        },
        baseArea,
        currentArea: baseArea,
        normal: { x: 0, y: 0, z: 1 },
        foldValue: 0,
        memoryBias: 0,
        visibility: 0,
        phase: id * 0.61803398875,
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

    return { nodes, edges, triangles, creaseEdges: [] };
  },
};
