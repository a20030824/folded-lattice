import type { SimulationSystem } from "../contracts";
import { clamp, valueNoise2D } from "../math";
import type { CreatureState, SimulationState } from "../state";

/**
 * Fear fades over ~6 seconds: leaving the fright radius does not mean
 * instantly calming down.
 */
const FEAR_DECAY_PER_SECOND = 1 / 2.4;
/**
 * Fright stretches the body up to this factor of its calm length;
 * resting draws the tail back in. Length is a mood, not a slider.
 */
const FLEE_LENGTH_BOOST = 1.4;
const REST_LENGTH_FACTOR = 0.5;
/**
 * Resting is not standing still: the head keeps crawling at a small
 * fraction of pace while turning steadily, so the line WINDS ITSELF
 * into a coil - the "puddle" is the body, thickened, not an extra
 * drawn object (judge's call).
 */
const REST_SPEED_FACTOR = 0.18;
const REST_TURN_RATE = 1.5;
/**
 * How much the stroke fattens at full rest; baked into the points as
 * they are laid, so only the coiled part of the body is heavy.
 */
const REST_GIRTH_BOOST = 1.3;

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
    fear: 0,
    restPool: 0,
    restSign: hash2 < 0.5 ? -1 : 1,
    retractTimer: 0,
    restEpisode: 0,
    restPressure: 0,
    restAnchorX: x,
    restAnchorY: y,
    restHeading: hash * Math.PI * 2,
  };
}

/**
 * The wandering line-creature, with three states readable from shape
 * alone: wandering (breathing pace and curvature), resting (speed
 * sinks to a crawl, the head pools into a drop, the body curls and
 * draws its tail in), and fleeing (lingering fear stretches and thins
 * the body until it calms down). Walls and the pointer only steer it,
 * and its body presses a narrow groove with soft shoulders into the
 * sheet - the terrain is how the world remembers where it has been.
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
    const baseSpeed = settings.baseSpeedRatio * shortSide;

    const head = creature.points[creature.points.length - 1]!;
    let headX = head.x;
    let headY = head.y;

    // The pointer is a predator; fright lingers as fear even after the
    // hand has left. This is the only thing the pointer touches.
    const pointer = state.pointer;
    let escapeTurn = 0;
    if (pointer.isInside && pointer.influence > 0.03) {
      const awayX = headX - pointer.position.x;
      const awayY = headY - pointer.position.y;
      const distance = Math.hypot(awayX, awayY);
      const frightRadius = settings.pointerRepelRadiusRatio * shortSide;
      if (distance < frightRadius && distance > 0.001) {
        const fright = (1 - distance / frightRadius) ** 2 * pointer.influence;
        creature.fear = Math.max(creature.fear, clamp(fright));
        const escape = Math.atan2(awayY, awayX);
        escapeTurn =
          angleDelta(creature.heading, escape) *
          clamp(fright * settings.pointerRepelTurnRate, 0, 6);
      }
    }
    creature.fear *= Math.exp(-FEAR_DECAY_PER_SECOND * deltaSeconds);
    if (creature.fear < 0.002) creature.fear = 0;

    // Pace breathes on slow noise: it lingers, then lopes. A lull can
    // become a real rest - and rest is a committed episode, not a
    // flicker of the noise: once it lies down it finishes the pose
    // (9-15s), and only a predator close by can interrupt. Sleep
    // pressure builds while awake, so a rest is rare but the observer
    // is guaranteed to meet one every couple of minutes.
    const paceNoise = valueNoise2D(time * 0.09 + seed, seed * 3.1);
    const pace = 0.25 + 1.15 * paceNoise * paceNoise;
    let resting = false;
    if (creature.restEpisode > 0) {
      creature.restEpisode -= deltaSeconds;
      if (creature.fear > 0.3) creature.restEpisode = 0;
      resting = creature.restEpisode > 0;
    } else {
      creature.restPressure += deltaSeconds / 75;
      const lullThreshold = 0.24 + clamp(creature.restPressure - 1) * 0.3;
      if (paceNoise < lullThreshold && creature.fear < 0.15) {
        creature.restEpisode =
          7 + 4 * valueNoise2D(time * 1.3 + seed * 5.1, 17.9);
        creature.restPressure = 0;
        creature.restSign =
          valueNoise2D(time * 3.7, seed) < 0.5 ? -1 : 1;
        creature.restAnchorX = headX;
        creature.restAnchorY = headY;
        creature.restHeading = creature.heading;
        resting = true;
      }
    }
    if (resting) {
      creature.restPool = clamp(creature.restPool + deltaSeconds / 4);
    } else {
      creature.restPool = clamp(creature.restPool - deltaSeconds / 2.5);
    }

    let targetSpeed = baseSpeed * pace;
    if (resting) targetSpeed = baseSpeed * REST_SPEED_FACTOR;
    targetSpeed *= 1 + settings.pointerSpeedBoost * creature.fear;

    // Curiosity: heading drifts on independent noise. A resting body
    // ignores curiosity and slowly curls instead.
    const drift =
      (valueNoise2D(time * 0.17 + seed * 7.7, 41.3 + seed) - 0.5) *
      2 *
      settings.wanderStrength;
    // The coil tightens as the rest deepens (same speed, more turn =
    // smaller radius), wobbling slightly so the rings do not stack
    // into a perfect circle.
    let turn = resting
      ? creature.restSign *
        REST_TURN_RATE *
        (0.4 + creature.restPool) *
        (0.85 + 0.3 * valueNoise2D(time * 0.4, seed * 9.1))
      : drift;
    turn += escapeTurn;

    // A slow invisible anchor sweeps the whole sheet on a Lissajous
    // orbit (incommensurate periods guarantee full coverage within a
    // few minutes); loosely seeking it keeps the creature from
    // homesteading one corner without ever looking pathfollowed.
    if (!resting) {
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
    }

    // A strongly hand-combed patch of grain is a message: the
    // creature reads the current the hand has drawn nearby and swims
    // along it for a while - curiosity, not compulsion. Its own
    // combing never saturates the handmark channel, so it does not
    // chase its own footprints.
    const grain = state.grain;
    if (!resting && creature.fear < 0.2 && grain) {
      const triangles = state.topology.triangles;
      const readRadius = shortSide * 0.18;
      const readSquared = readRadius * readRadius;
      let orientX = 0;
      let orientY = 0;
      let readWeight = 0;
      for (let index = 0; index < triangles.length; index += 1) {
        const mark = grain.handmark[index]!;
        if (mark < 0.35) continue;
        const center = triangles[index]!.center;
        const dx = center.x - headX;
        const dy = center.y - headY;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > readSquared) continue;
        const weight =
          mark * Math.exp(-distanceSquared / (readSquared * 0.5));
        orientX += Math.cos(grain.angle[index]! * 2) * weight;
        orientY += Math.sin(grain.angle[index]! * 2) * weight;
        readWeight += weight;
      }
      if (readWeight > 0.4) {
        const orientation = Math.atan2(orientY, orientX) / 2;
        // An orientation offers two ways to swim; take the gentler turn.
        const forward = angleDelta(creature.heading, orientation);
        const backward = angleDelta(creature.heading, orientation + Math.PI);
        const gentler =
          Math.abs(forward) <= Math.abs(backward) ? forward : backward;
        turn += gentler * clamp(readWeight * 0.5) * 1.6;
      }
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

    const maximumTurn =
      settings.maximumTurnRate * (1 + (targetSpeed > baseSpeed ? 1 : 0));
    creature.heading += clamp(turn, -maximumTurn, maximumTurn) * deltaSeconds;
    creature.speed += (targetSpeed - creature.speed) * clamp(3.5 * deltaSeconds);

    headX += Math.cos(creature.heading) * creature.speed * deltaSeconds;
    headY += Math.sin(creature.heading) * creature.speed * deltaSeconds;
    headX = clamp(headX, 2, width - 2);
    headY = clamp(headY, 2, height - 2);

    // Body length is a mood: fear stretches it, rest draws it back in.
    const targetLength = Math.max(
      8,
      Math.round(
        settings.trailCount *
          (1 - (1 - REST_LENGTH_FACTOR) * creature.restPool) *
          (1 + FLEE_LENGTH_BOOST * creature.fear),
      ),
    );

    // Lay body samples at fixed spacing; slow travel widens the stroke.
    const spacing = Math.max(1, settings.segmentSpacingRatio * shortSide);
    const step = Math.hypot(headX - head.x, headY - head.y);
    creature.distanceSinceSample += step;
    head.x = headX;
    head.y = headY;
    if (creature.distanceSinceSample >= spacing) {
      creature.distanceSinceSample = 0;
      const slowness = clamp(
        1.3 - creature.speed / (baseSpeed * 1.25),
        0.4,
        1,
      );
      // Rest fattens the stroke as it is laid: the winding coil grows
      // heavy with ink while the walking parts of the trail stay thin.
      const girth = Math.min(
        2.1,
        slowness * (1 + REST_GIRTH_BOOST * creature.restPool),
      );
      creature.points.push({ x: headX, y: headY, widthFactor: girth });
      while (creature.points.length > targetLength) creature.points.shift();
    }
    // Visible retraction: while too long (resting), the tail is drawn
    // in steadily even though no new samples arrive.
    if (creature.points.length > targetLength) {
      creature.retractTimer += deltaSeconds;
      if (creature.retractTimer >= 0.12) {
        creature.retractTimer = 0;
        creature.points.shift();
      }
    } else {
      creature.retractTimer = 0;
    }

    // The ground interaction: the body does not just stamp depth, it
    // DISPLACES the sheet. Nodes under the line are pressed down and
    // pushed sideways off the path; the spring weave piles the pushed
    // material into a rim on its own, and the fine mesh wrinkles
    // around the groove instead of shading a prescribed profile.
    // Resting presses the nest deeper.
    if (settings.carveStrength > 0) {
      const count = creature.points.length;
      const grooveRadius = Math.max(1, settings.carveRadiusRatio * shortSide * 0.55);
      const shoulderRadius = grooveRadius * 2.4;
      const rejectSquared = shoulderRadius * shoulderRadius * 9;
      // Rest presses only gently harder: the nest should read as a
      // soft dimple under the coil, not a starburst pucker.
      const strength = settings.carveStrength * (1 + creature.restPool * 0.5);
      for (const node of state.topology.nodes) {
        if (node.pinned) continue;
        let down = 0;
        let ridge = 0;
        let nearestSquared = Infinity;
        let nearestDx = 0;
        let nearestDy = 0;
        for (let back = 0; back < 28 && back < count; back += 4) {
          const point = creature.points[count - 1 - back]!;
          const dx = node.position.x - point.x;
          const dy = node.position.y - point.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared > rejectSquared) continue;
          if (distanceSquared < nearestSquared) {
            nearestSquared = distanceSquared;
            nearestDx = dx;
            nearestDy = dy;
          }
          const groove = Math.exp(-distanceSquared / (grooveRadius * grooveRadius));
          const shoulder = Math.exp(
            -distanceSquared / (shoulderRadius * shoulderRadius),
          );
          if (groove > down) down = groove;
          const rim = shoulder - groove * 1.2;
          if (rim > ridge) ridge = rim;
        }
        if (down > 0.01 || ridge > 0.01) {
          node.force.z -= strength * (down - ridge * 0.4);
          // The line GATHERS the sheet like a thread pulled through
          // cloth: wall nodes are drawn toward the path, and the weave
          // puckers into a seam along it. Peaks on the groove wall
          // (down = 0.5), vanishing at the center where the direction
          // is undefined.
          const nearestDistance = Math.sqrt(nearestSquared);
          if (nearestDistance > 0.5) {
            const gather =
              strength * 0.45 * down * (1 - down) * 4;
            node.force.x -= (nearestDx / nearestDistance) * gather;
            node.force.y -= (nearestDy / nearestDistance) * gather;
          }
        }
      }
    }
  },
};
