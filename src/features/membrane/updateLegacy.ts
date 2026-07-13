import type { SimulationSystem } from "../../core/contracts";
import { legacyMemoryConfigKey } from "./config";
import { requireMembranePulseRuntime } from "./state";

/**
 * A second, much slower memory layer. Where memoryBias tracks the
 * current fold and fades in seconds, legacy only tracks *how often* a
 * pulse has recently lit a triangle's edges, then spreads that value
 * across the mesh each step before decaying it over minutes. The
 * diffusion is what keeps its shape from matching the pulse's exact
 * geodesic front — it bleeds into neighbors like a stain, not a stamp.
 */
export const legacyMemorySystem: SimulationSystem = {
  name: "legacy-memory",
  update(state, config, deltaSeconds) {
    const settings = config.modules.get(legacyMemoryConfigKey);
    if (!settings?.enabled) return;

    const { triangles } = state.topology;
    const pulseRuntime = requireMembranePulseRuntime(state);
    if (pulseRuntime.topology !== state.topology) {
      throw new Error(
        "Membrane pulse runtime does not match the active topology.",
      );
    }
    const { edgePulse } = pulseRuntime;
    const decay = Math.exp(-deltaSeconds / Math.max(1, settings.decaySeconds));
    const diffusion = Math.min(1, settings.diffusionRate * deltaSeconds);

    for (const triangle of triangles) {
      const pulse =
        ((edgePulse[triangle.edgeA] ?? 0) +
          (edgePulse[triangle.edgeB] ?? 0) +
          (edgePulse[triangle.edgeC] ?? 0)) /
        3;

      triangle.legacy = Math.min(
        settings.maximum,
        triangle.legacy + pulse * settings.depositRate * deltaSeconds,
      );
    }

    // Diffuse toward the neighbor mean using the pre-diffusion values,
    // so the spread this step is symmetric rather than order-biased.
    if (!state.legacyScratch || state.legacyScratch.length !== triangles.length) {
      state.legacyScratch = new Float32Array(triangles.length);
    }
    const before = state.legacyScratch;
    for (let index = 0; index < triangles.length; index += 1) {
      before[index] = triangles[index]!.legacy;
    }

    for (let index = 0; index < triangles.length; index += 1) {
      const triangle = triangles[index]!;
      const neighbors = triangle.neighborIndices;
      if (neighbors.length === 0) continue;

      let total = 0;
      for (const neighborIndex of neighbors) {
        total += before[neighborIndex] ?? 0;
      }
      const neighborMean = total / neighbors.length;

      triangle.legacy =
        (before[index]! + (neighborMean - before[index]!) * diffusion) * decay;
    }
  },
};
