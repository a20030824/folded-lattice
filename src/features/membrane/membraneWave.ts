import type { SimulationSystem } from "../../core/contracts";
import { membraneWaveConfigKey } from "./config";

interface Disturbance {
  x: number;
  y: number;
  radius: number;
  strength: number;
  duration: number;
  age: number;
}

interface WaveScratch {
  pointerWasDown: boolean;
  lastX: number;
  lastY: number;
  disturbances: Disturbance[];
}

const scratchByState = new WeakMap<object, WaveScratch>();

/**
 * A tap plucks the membrane; a held drag lays a chain of smaller plucks.
 * Every impulse is a zero-area Mexican-hat profile, so the sheet rings
 * without accumulating a permanent upward or downward bias.
 */
export const membraneWaveSystem: SimulationSystem = {
  name: "membrane-wave",
  update(state, config, deltaSeconds) {
    const settings = config.modules.require(membraneWaveConfigKey);
    if (!settings.enabled) return;
    let scratch = scratchByState.get(state);
    if (!scratch) {
      scratch = {
        pointerWasDown: false,
        lastX: state.pointer.position.x,
        lastY: state.pointer.position.y,
        disturbances: [],
      };
      scratchByState.set(state, scratch);
    }

    const shortSide = Math.max(1, Math.min(state.viewport.width, state.viewport.height));
    const pointerDown = state.pointer.isInside && state.pointer.isDown;
    const addDisturbance = (
      x: number,
      y: number,
      strength: number,
      duration: number,
    ): void => {
      scratch!.disturbances.push({
        x,
        y,
        radius: shortSide * settings.impactRadiusRatio,
        strength,
        duration,
        age: 0,
      });
      if (scratch!.disturbances.length > 18) scratch!.disturbances.shift();
    };

    if (pointerDown && !scratch.pointerWasDown) {
      addDisturbance(
        state.pointer.position.x,
        state.pointer.position.y,
        settings.impactStrength,
        settings.impactSeconds,
      );
      scratch.lastX = state.pointer.position.x;
      scratch.lastY = state.pointer.position.y;
    } else if (pointerDown) {
      let dx = state.pointer.position.x - scratch.lastX;
      let dy = state.pointer.position.y - scratch.lastY;
      let distance = Math.hypot(dx, dy);
      const spacing = Math.max(2, shortSide * settings.dragSpacingRatio);
      while (distance >= spacing) {
        const t = spacing / distance;
        scratch.lastX += dx * t;
        scratch.lastY += dy * t;
        addDisturbance(
          scratch.lastX,
          scratch.lastY,
          settings.dragStrength,
          settings.dragSeconds,
        );
        dx = state.pointer.position.x - scratch.lastX;
        dy = state.pointer.position.y - scratch.lastY;
        distance = Math.hypot(dx, dy);
      }
    }
    scratch.pointerWasDown = pointerDown;

    for (let index = scratch.disturbances.length - 1; index >= 0; index -= 1) {
      const disturbance = scratch.disturbances[index]!;
      disturbance.age += deltaSeconds;
      if (disturbance.age >= disturbance.duration) {
        scratch.disturbances.splice(index, 1);
        continue;
      }
      const phase = Math.sin(Math.PI * disturbance.age / disturbance.duration);
      const radiusSquared = disturbance.radius * disturbance.radius;
      for (const node of state.topology.nodes) {
        if (node.pinned) continue;
        const dx = node.position.x - disturbance.x;
        const dy = node.position.y - disturbance.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > radiusSquared * 14) continue;
        const hat =
          Math.exp(-distanceSquared / radiusSquared) -
          0.25 * Math.exp(-distanceSquared / (radiusSquared * 4));
        node.force.z -= disturbance.strength * phase * hat;
      }
    }
  },
};
