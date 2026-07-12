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

export interface TopologyState {
  nodes: NodeState[];
  edges: EdgeState[];
  triangles: TriangleState[];
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
    topology: { nodes: [], edges: [], triangles: [] },
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
