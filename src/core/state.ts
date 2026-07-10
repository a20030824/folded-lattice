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
  strength: number;
  triangleA: number;
  triangleB: number;
}

export interface TopologyState {
  nodes: NodeState[];
  edges: EdgeState[];
  triangles: TriangleState[];
  creaseEdges: CreaseEdgeState[];
}

export interface SimulationState {
  topology: TopologyState;
  fields: FieldState[];
  pointer: PointerState;
  viewport: Viewport;
  time: TimeState;
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
  };
}
