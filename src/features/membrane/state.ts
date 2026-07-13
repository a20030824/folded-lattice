import { createResourceKey } from "../../core/resources";
import type { SimulationState, TopologyState } from "../../core/state";

export interface MembranePulseRuntime {
  readonly topology: TopologyState;
  readonly edgePulse: Float32Array;
}

export const membranePulseRuntimeKey =
  createResourceKey<MembranePulseRuntime>("membrane-pulse-runtime");

export function createMembranePulseRuntime(
  topology: TopologyState,
): MembranePulseRuntime {
  return {
    topology,
    edgePulse: new Float32Array(topology.edges.length),
  };
}

export function requireMembranePulseRuntime(
  state: Readonly<SimulationState>,
): MembranePulseRuntime {
  return state.resources.require(membranePulseRuntimeKey);
}

export function getMembranePulseRuntime(
  state: Readonly<SimulationState>,
): MembranePulseRuntime | undefined {
  return state.resources.get(membranePulseRuntimeKey);
}
