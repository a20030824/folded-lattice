import type { SimulationSystem } from "../contracts";
import { clamp, damp } from "../math";

export const memorySystem: SimulationSystem = {
  name: "structural-memory",
  update(state, config, deltaSeconds) {
    const settings = config.memory;
    if (!settings.enabled) return;

    for (const edge of state.topology.edges) {
      const stressTarget = clamp(edge.tension * 16, 0, settings.maximumMemory);
      const rate = stressTarget > edge.memory
        ? settings.edgeAccumulationRate
        : settings.edgeDecayRate;
      edge.memory = damp(edge.memory, stressTarget, rate, deltaSeconds);
      edge.restLength =
        edge.baseRestLength * (1 + edge.memory * settings.edgeRestLengthInfluence);
    }

    for (const triangle of state.topology.triangles) {
      const foldTarget = clamp(
        triangle.foldValue,
        -settings.maximumMemory,
        settings.maximumMemory,
      );
      const rate =
        Math.abs(foldTarget) > Math.abs(triangle.memoryBias)
          ? settings.triangleAccumulationRate
          : settings.triangleDecayRate;
      triangle.memoryBias = damp(triangle.memoryBias, foldTarget, rate, deltaSeconds);
    }

    const memoryScale =
      Math.min(state.viewport.width, state.viewport.height) * 0.018;
    for (const node of state.topology.nodes) {
      if (node.pinned || node.triangleIndices.length === 0) continue;
      let total = 0;
      for (const triangleIndex of node.triangleIndices) {
        total += state.topology.triangles[triangleIndex]?.memoryBias ?? 0;
      }
      const targetZ = (total / node.triangleIndices.length) * memoryScale;
      node.memoryOffset.z = damp(node.memoryOffset.z, targetZ, 0.12, deltaSeconds);
    }
  },
};
