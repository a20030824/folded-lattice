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

export interface MembraneLegacyRuntime {
  readonly topology: TopologyState;
  readonly triangleLegacy: Float32Array;
  readonly diffusionScratch: Float32Array;
}

export const membraneLegacyRuntimeKey =
  createResourceKey<MembraneLegacyRuntime>("membrane-legacy-runtime");

export function createMembraneLegacyRuntime(
  topology: TopologyState,
): MembraneLegacyRuntime {
  return {
    topology,
    triangleLegacy: new Float32Array(topology.triangles.length),
    diffusionScratch: new Float32Array(topology.triangles.length),
  };
}

export function requireMembraneLegacyRuntime(
  state: Readonly<SimulationState>,
): MembraneLegacyRuntime {
  const runtime = state.resources.require(membraneLegacyRuntimeKey);
  if (runtime.topology !== state.topology) {
    throw new Error(
      "Membrane legacy runtime does not match the active topology.",
    );
  }
  return runtime;
}

export function getMembraneLegacyRuntime(
  state: Readonly<SimulationState>,
): MembraneLegacyRuntime | undefined {
  const runtime = state.resources.get(membraneLegacyRuntimeKey);
  return runtime?.topology === state.topology ? runtime : undefined;
}
