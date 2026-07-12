import { ResourceStore } from "./resources";
import type { PointerState, TimeState, Vec3, Viewport } from "./types";

export interface NodeState {
  id: number;
  position: Vec3;
  previousPosition: Vec3;
  velocity: Vec3;
  force: Vec3;
  restPosition: Vec3;
  memoryOffset: Vec3;
  mass: number;
  inverseMass: number;
  pinned: boolean;
  edgeIndices: number[];
  triangleIndices: number[];
  /**
   * Set when this node sits on a crease rail: which living crease, and
   * how far from its origin (0..1). Renderers use it to split and
   * gradate normal smoothing per frame.
   */
  creaseTag?: { creaseId: number; fromOrigin: number };
}

export interface EdgeState {
  id: number;
  nodeA: number;
  nodeB: number;
  baseRestLength: number;
  restLength: number;
  currentLength: number;
  strain: number;
  tension: number;
  memory: number;
  visibility: number;
  highlight: number;
  /**
   * Warm wavefront intensity while a tension pulse is crossing this edge.
   */
  pulse: number;
}

export interface TriangleState {
  id: number;
  nodeA: number;
  nodeB: number;
  nodeC: number;
  edgeA: number;
  edgeB: number;
  edgeC: number;
  center: Vec3;
  baseArea: number;
  currentArea: number;
  normal: Vec3;
  foldValue: number;
  memoryBias: number;
  visibility: number;
  phase: number;
  neighborIndices: number[];
  /**
   * Slow, mesh-diffused trace of where tension pulses have repeatedly
   * passed. Independent of memoryBias (which follows the local fold):
   * this one spreads to neighbors and decays over minutes, not seconds.
   */
  legacy: number;
}

export type FieldKind = "pressure" | "ambient-drift" | "pointer" | "phase";

export interface FieldState {
  id: number;
  kind: FieldKind;
  position: Vec3;
  velocity: Vec3;
  radius: number;
  strength: number;
  polarity: 1 | -1;
  seed: number;
  age: number;
  lifetime: number;
  active: boolean;
}

/**
 * An edge that lies on a crease of the sheet. Only these edges are ever
 * drawn as lines by surface-first renderers; sign +1 is a ridge, -1 a valley.
 */
export interface CreaseEdgeState {
  edgeIndex: number;
  sign: 1 | -1;
  /**
   * Strength at rail-build time. Surface renderers should NOT trust this
   * snapshot: look the living crease up by creaseId and use its current
   * strength/growth, so sharpness can fade with the fold.
   */
  strength: number;
  /**
   * The living crease this rail segment belongs to; may no longer exist
   * in the field (a healed fold whose rail awaits garbage collection).
   */
  creaseId: number;
  /**
   * Normalized distance of this edge from the crease origin (0 under the
   * event point, 1 at the farther tip) - growth gates sharpness with it.
   */
  fromOrigin: number;
  triangleA: number;
  triangleB: number;
}

export interface CreasePointState {
  x: number;
  y: number;
  /**
   * Normalized distance from the crease ORIGIN (the press/anchor point):
   * 0 at the origin, 1 at whichever end lies farther. Growth reveals
   * points outward from the origin along both branches at once.
   */
  fromOrigin: number;
}

/**
 * A fold line as a living object: it can grow tip-forward, hold, and fade.
 */
export interface CreaseState {
  id: number;
  kind: "major" | "minor";
  sign: 1 | -1;
  points: CreasePointState[];
  widthRatio: number;
  /**
   * Final width once the fold has set; fresh folds start wider and
   * narrow as they mature.
   */
  targetWidthRatio: number;
  /**
   * Seconds after birth until the fold is fully set (width settled).
   */
  maturitySeconds: number;
  strength: number;
  /**
   * 0..1 fraction of the polyline that currently exists.
   */
  growth: number;
  growthPerSecond: number;
  /**
   * Strength lost per second; 0 for permanent folds.
   */
  fadePerSecond: number;
  age: number;
  /**
   * Cached bounding box (inflated by influence width) for fast rejection.
   */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * The dynamic fold field behind a crumpled-sheet topology. Systems mutate
 * crease strengths/growth and re-derive the rest pose from it.
 */
export interface CreaseFieldState {
  creases: CreaseState[];
  crushZones: { x: number; y: number }[];
  shortSide: number;
  amplitude: number;
  waveSeed: number;
  nextCreaseId: number;
}

export interface TopologyState {
  nodes: NodeState[];
  edges: EdgeState[];
  triangles: TriangleState[];
  creaseEdges: CreaseEdgeState[];
  creaseField?: CreaseFieldState;
}

export interface SimulationState {
  topology: TopologyState;
  fields: FieldState[];
  pointer: PointerState;
  viewport: Viewport;
  time: TimeState;
  resources: ResourceStore;
  /** Reused by triangle-memory diffusion to avoid per-tick garbage. */
  legacyScratch?: Float32Array;
}

export function createEmptySimulationState(viewport: Viewport): SimulationState {
  return {
    topology: { nodes: [], edges: [], triangles: [], creaseEdges: [] },
    fields: [],
    pointer: {
      position: { x: 0, y: 0 },
      previousPosition: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      isInside: false,
      isDown: false,
      influence: 0,
    },
    viewport,
    time: { elapsed: 0, delta: 0, fixedDelta: 1 / 60, frame: 0 },
    resources: new ResourceStore(),
  };
}
