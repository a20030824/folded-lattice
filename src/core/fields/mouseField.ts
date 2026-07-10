import type { FrameSystem, SimulationSystem } from "../contracts";
import { damp } from "../math";

export const mouseFieldSystem: SimulationSystem = {
  name: "pointer-field",
  update(state, config) {
    const settings = config.fields.pointer;
    if (!settings.enabled || state.pointer.influence < 0.001) return;

    const radius = Math.min(state.viewport.width, state.viewport.height) * settings.radiusRatio;
    const radiusSquared = radius * radius;
    const polarity = state.pointer.isDown ? -1 : 1;

    for (const node of state.topology.nodes) {
      if (node.pinned) continue;
      const dx = node.position.x - state.pointer.position.x;
      const dy = node.position.y - state.pointer.position.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= radiusSquared) continue;
      const falloff = 1 - Math.sqrt(distanceSquared) / radius;
      const influence = falloff * falloff * state.pointer.influence;
      node.force.z += influence * settings.strength * polarity;
      node.force.x += state.pointer.velocity.x * settings.dragStrength * influence;
      node.force.y += state.pointer.velocity.y * settings.dragStrength * influence;
    }
  },
};

export const pointerSmoothingSystem: FrameSystem = {
  name: "pointer-smoothing",
  updateFrame(state, config, deltaSeconds) {
    const target = config.fields.pointer.enabled && state.pointer.isInside ? 1 : 0;
    const rate =
      target > state.pointer.influence
        ? config.fields.pointer.influenceAttack
        : config.fields.pointer.influenceRelease;
    state.pointer.influence = damp(state.pointer.influence, target, rate, deltaSeconds);
    const velocityDecay = Math.exp(-12 * deltaSeconds);
    state.pointer.velocity.x *= velocityDecay;
    state.pointer.velocity.y *= velocityDecay;
  },
};
