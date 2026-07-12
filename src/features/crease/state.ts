import { createResourceKey } from "../../core/resources";
import type { SimulationState } from "../../core/state";

/** An edge that lies on a crease rail. */
export interface CreaseEdgeState {
  edgeIndex: number;
  sign: 1 | -1;
  strength: number;
  creaseId: number;
  fromOrigin: number;
  triangleA: number;
  triangleB: number;
}

export interface CreasePointState {
  x: number;
  y: number;
  fromOrigin: number;
}

/** A living fold line that can grow, mature, and fade. */
export interface CreaseState {
  id: number;
  kind: "major" | "minor";
  sign: 1 | -1;
  points: CreasePointState[];
  widthRatio: number;
  targetWidthRatio: number;
  maturitySeconds: number;
  strength: number;
  growth: number;
  growthPerSecond: number;
  fadePerSecond: number;
  age: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CreaseFieldState {
  creases: CreaseState[];
  crushZones: { x: number; y: number }[];
  shortSide: number;
  amplitude: number;
  waveSeed: number;
  nextCreaseId: number;
}

export interface CreaseNodeTag {
  creaseId: number;
  fromOrigin: number;
}

export interface CreaseRuntimeState {
  creaseEdges: CreaseEdgeState[];
  creaseField: CreaseFieldState;
  nodeTags: Array<CreaseNodeTag | undefined>;
}

export const creaseRuntimeKey = createResourceKey<CreaseRuntimeState>(
  "crease-runtime",
);

export function getCreaseRuntime(state: SimulationState): CreaseRuntimeState {
  return state.resources.require(creaseRuntimeKey);
}
