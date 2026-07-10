import type { SimulationSystem } from "../contracts";

export const ambientDriftSystem: SimulationSystem = {
  name: "ambient-drift",
  update(state, config) {
    const settings = config.fields.ambient;
    const time = state.time.elapsed * settings.speed;

    for (const node of state.topology.nodes) {
      if (node.pinned) continue;
      const phaseX = node.restPosition.x * settings.scale + time;
      const phaseY = node.restPosition.y * settings.scale * 1.17 - time * 0.73;
      node.force.x += Math.sin(phaseY) * settings.strength * 0.08;
      node.force.y += Math.cos(phaseX) * settings.strength * 0.08;
      node.force.z +=
        (Math.sin(phaseX) + Math.cos(phaseY) + Math.sin(phaseX + phaseY) * 0.5) *
        settings.strength;
    }
  },
};
