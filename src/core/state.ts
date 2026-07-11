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

export interface CreasePointState {
  x: number;
  y: number;
  /**
   * Cumulative position along the crease, 0 at the origin, 1 at the tip.
   * Growth animation reveals points in arc order.
   */
  arc: number;
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

/**
 * One sample of the wanderer's body, tail to head. Width factor records
 * how fast the creature moved when this point was laid down - slow
 * travel pools into a wider stroke, like a brush.
 */
export interface CreaturePointState {
  x: number;
  y: number;
  widthFactor: number;
}

/**
 * A single line-creature that roams the sheet. It is the only actor:
 * its path dents the terrain, and the pointer only ever talks to it.
 */
export interface CreatureState {
  points: CreaturePointState[];
  heading: number;
  speed: number;
  distanceSinceSample: number;
  /**
   * Lingering fright, 0..1. Spikes when the pointer gets close and
   * decays over seconds - the creature does not calm down the moment
   * the hand leaves.
   */
  fear: number;
  /**
   * How settled the current rest is, 0..1. Grows while resting; the
   * head pools into a drop of ink and the press deepens with it.
   */
  restPool: number;
  /**
   * Which way the body curls when it rests; picked per rest episode.
   */
  restSign: 1 | -1;
  /**
   * Timer that paces the visible tail retraction while shrinking.
   */
  retractTimer: number;
  /**
   * Seconds left of the current committed rest episode; 0 when awake.
   * Once it lies down it finishes the pose - only a predator close by
   * can interrupt.
   */
  restEpisode: number;
  /**
   * Sleep pressure, grows while awake. The longer since the last rest,
   * the easier the next lull becomes one - rest is rare but findable.
   */
  restPressure: number;
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
  creature?: CreatureState;
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
