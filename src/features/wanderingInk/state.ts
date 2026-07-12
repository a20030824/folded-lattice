import { createResourceKey } from "../../core/resources";
import type { SimulationState } from "../../core/state";
import type { CreatureState } from "./types";

export interface InkRuntimeState {
  creature?: CreatureState;
  edgeInk?: Float32Array;
  wickScratch?: Float32Array;
}

export const inkRuntimeKey = createResourceKey<InkRuntimeState>(
  "wandering-ink-runtime",
);

export function getInkRuntime(state: SimulationState): InkRuntimeState {
  return state.resources.getOrCreate(inkRuntimeKey, () => ({}));
}
