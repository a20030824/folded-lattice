import type { SimulationSystem } from "../contracts";
import { clamp, valueNoise2D } from "../math";
import type { CreatureState, SimulationState } from "../state";

/**
 * Shortest signed angle from `from` to `to`.
 */
function angleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function createCreature(state: SimulationState, seed: number): CreatureState {
  const hash = Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;
  const hash2 = Math.abs(Math.sin(seed * 78.233) * 24634.6345) % 1;
  const x = state.viewport.width * (0.3 + hash * 0.4);
  const y = state.viewport.height * (0.3 + hash2 * 0.4);
  return {
    points: [{ x, y, widthFactor: 0.7 }],
    heading: hash * Math.PI * 2,
    speed: 0,
    distanceSinceSample: 0,
  };
}

/**
 * The wandering line-creature. Its pace and curvature breathe on slow
 * noise, walls and the pointer only steer it (never teleport it), and
 * its head presses a travelling dent into the sheet - the terrain is
 * how the world remembers where it has been.
 */
export const wandererSystem: SimulationSystem = {
  name: "wanderer",
  update(state, config, deltaSeconds) {
    const settings = config.creature;
    if (!settings?.enabled) return;

    if (!state.creature) {
      state.creature = createCreature(state, config.topology.randomSeed);
    }
    const creature = state.creature;
    const width = state.viewport.width;
    const height = state.viewport.height;
    const shortSide = Math.max(1, Math.min(width, height));
    const time = state.time.elapsed;
    const seed = config.topology.randomSeed * 0.001;

    const head = creature.points[creature.points.length - 1]!;
    let headX = head.x;
    let headY = head.y;

    // Pace breathes on slow noise: it lingers, then lopes. The square
    // stretches the slow tail so pauses actually read as pauses.
    const paceNoise = valueNoise2D(time * 0.09 + seed, seed * 3.1);
    const pace = 0.25 + 1.15 * paceNoise * paceNoise;
    let targetSpeed = settings.baseSpeedRatio * shortSide * pace;

    // Curiosity: heading drifts on independent noise.
    const drift =
      (valueNoise2D(time * 0.17 + seed * 7.7, 41.3 + seed) - 0.5) *
      2 *
      settings.wanderStrength;
    let turn = drift;

    // A slow invisible anchor sweeps the whole sheet on a Lissajous
    // orbit (incommensurate periods guarantee full coverage within a
    // few minutes); loosely seeking it keeps the creature from
    // homesteading one corner without ever looking pathfollowed.
    const jitter = valueNoise2D(time * 0.05 + seed * 13.7, 5.3) - 0.5;
    const anchorX =
      width * (0.5 + 0.36 * Math.sin(time * 0.0648 + seed * 11) + 0.06 * jitter);
    const anchorY =
      height * (0.5 + 0.36 * Math.sin(time * 0.103 + seed * 23) + 0.06 * jitter);
    const toAnchorX = anchorX - headX;
    const toAnchorY = anchorY - headY;
    const anchorDistance = Math.hypot(toAnchorX, toAnchorY);
    if (anchorDistance > shortSide * 0.15) {
      const toAnchor = Math.atan2(toAnchorY, toAnchorX);
      const longing = clamp((anchorDistance / shortSide - 0.15) * 1.6);
      turn += angleDelta(creature.heading, toAnchor) * longing * 1.5;
    }

    // Soft walls steer it back toward open ground.
    const margin = settings.marginRatio * shortSide;
    let steerX = 0;
    let steerY = 0;
    if (headX < margin) steerX += (margin - headX) / margin;
    if (headX > width - margin) steerX -= (headX - (width - margin)) / margin;
    if (headY < margin) steerY += (margin - headY) / margin;
    if (headY > height - margin) steerY -= (headY - (height - margin)) / margin;
    const wallUrgency = Math.hypot(steerX, steerY);
    if (wallUrgency > 0.001) {
      const toOpen = Math.atan2(steerY, steerX);
      turn += angleDelta(creature.heading, toOpen) * clamp(wallUrgency) * 3.2;
    }

    // The pointer is a predator: inside the fright radius the creature
    // turns away and bolts. This is the only thing the pointer touches.
    const pointer = state.pointer;
    if (pointer.isInside && pointer.influence > 0.03) {
      const awayX = headX - pointer.position.x;
      const awayY = headY - pointer.position.y;
      const distance = Math.hypot(awayX, awayY);
      const frightRadius = settings.pointerRepelRadiusRatio * shortSide;
      if (distance < frightRadius && distance > 0.001) {
        const fright =
          (1 - distance / frightRadius) ** 2 * pointer.influence;
        const escape = Math.atan2(awayY, awayX);
        turn += angleDelta(creature.heading, escape) *
          clamp(fright * settings.pointerRepelTurnRate, 0, 6) *
          deltaSeconds *
          60;
        targetSpeed *= 1 + settings.pointerSpeedBoost * fright;
      }
    }

    const maximumTurn =
      settings.maximumTurnRate * (1 + (targetSpeed > settings.baseSpeedRatio * shortSide ? 1 : 0));
    creature.heading += clamp(turn, -maximumTurn, maximumTurn) * deltaSeconds;
    creature.speed += (targetSpeed - creature.speed) * clamp(3.5 * deltaSeconds);

    headX += Math.cos(creature.heading) * creature.speed * deltaSeconds;
    headY += Math.sin(creature.heading) * creature.speed * deltaSeconds;
    headX = clamp(headX, 2, width - 2);
    headY = clamp(headY, 2, height - 2);

    // Lay body samples at fixed spacing; slow travel widens the stroke.
    const spacing = Math.max(1, settings.segmentSpacingRatio * shortSide);
    const step = Math.hypot(headX - head.x, headY - head.y);
    creature.distanceSinceSample += step;
    head.x = headX;
    head.y = headY;
    if (creature.distanceSinceSample >= spacing) {
      creature.distanceSinceSample = 0;
      const slowness = clamp(
        1.3 - creature.speed / (settings.baseSpeedRatio * shortSide * 1.25),
        0.4,
        1,
      );
      creature.points.push({ x: headX, y: headY, widthFactor: slowness });
      while (creature.points.length > settings.trailCount) creature.points.shift();
    }

    // The head presses a travelling dent into the sheet.
    if (settings.carveStrength > 0) {
      const carveRadius = Math.max(1, settings.carveRadiusRatio * shortSide);
      const carveRadiusSquared = carveRadius * carveRadius * 9;
      for (const node of state.topology.nodes) {
        if (node.pinned) continue;
        const dx = node.position.x - headX;
        const dy = node.position.y - headY;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > carveRadiusSquared) continue;
        node.force.z -=
          settings.carveStrength *
          Math.exp(-distanceSquared / (carveRadius * carveRadius));
      }
    }
  },
};
