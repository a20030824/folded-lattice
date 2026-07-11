import type { SimulationSystem } from "../contracts";
import { clamp, createRandom } from "../math";
import type { CreaseFieldState, CreaseState, SimulationState } from "../state";
import {
  buildCreaseState,
  evaluateCreaseField,
  walkCreasePoints,
} from "../topology/creaseTopology";

/**
 * Gives the fold network a layered life cycle:
 * - minors grow, set, and heal on a scale of minutes;
 * - the major skeleton itself hands over on a much longer period;
 * - a patient press of the hand sets a fold along the last drag gesture.
 * The rest pose is re-derived from the evolving field, so shading,
 * physics, and history all follow one mechanism.
 */

interface LifeScratch {
  random: () => number;
  lastPointerSeenAt: number;
  pressHeld: number;
  pressFired: boolean;
  lastPointerX: number;
  lastPointerY: number;
  lastMoveDirectionX: number;
  lastMoveDirectionY: number;
  lastMoveAt: number;
  pressCooldownUntil: number;
  nextSpawnAt: number;
  nextMajorAt: number;
  spawnInCalmNext: boolean;
  recomputeTimer: number;
  dirty: boolean;
}

const scratchByState = new WeakMap<SimulationState, LifeScratch>();

interface FoldSpec {
  originX: number;
  originY: number;
  directionX?: number;
  directionY?: number;
  kind: "major" | "minor";
  sign: 1 | -1;
  strength: number;
  halfLength: number;
  widthRatio: number;
  growSeconds: number;
  fadePerSecond: number;
  maturitySeconds: number;
}

function spawnFold(
  state: SimulationState,
  scratch: LifeScratch,
  spec: FoldSpec,
): void {
  const field = state.topology.creaseField!;
  const random = scratch.random;
  const shortSide = field.shortSide;
  const overscan = shortSide * 0.16;
  const bounds = {
    minX: -overscan,
    maxX: state.viewport.width + overscan,
    minY: -overscan,
    maxY: state.viewport.height + overscan,
  };

  let directionX = spec.directionX ?? 0;
  let directionY = spec.directionY ?? 0;
  const directionLength = Math.hypot(directionX, directionY);
  if (directionLength < 1e-6) {
    const angle = random() * Math.PI * 2;
    directionX = Math.cos(angle);
    directionY = Math.sin(angle);
  } else {
    directionX /= directionLength;
    directionY /= directionLength;
  }
  const curvature = (random() - 0.5) * 0.09;
  const step = shortSide * 0.04;

  // Grow both ways from the origin so the fold sets under the event point.
  const forward = walkCreasePoints(
    spec.originX, spec.originY, directionX, directionY,
    spec.halfLength, step, shortSide * 0.008, curvature, bounds, random,
  );
  const backward = walkCreasePoints(
    spec.originX, spec.originY, -directionX, -directionY,
    spec.halfLength, step, shortSide * 0.008, -curvature, bounds, random,
  );
  const points = [...backward.slice(1).reverse(), ...forward];
  if (points.length < 3) return;

  const crease = buildCreaseState(
    field.nextCreaseId,
    spec.kind,
    spec.sign,
    spec.strength,
    spec.widthRatio,
    points,
    shortSide,
    0,
    spec.fadePerSecond,
  );
  // Fresh folds arrive wide and soft, then narrow as they set.
  crease.targetWidthRatio = spec.widthRatio;
  crease.widthRatio = spec.widthRatio * 1.5;
  crease.maturitySeconds = spec.maturitySeconds;
  crease.growthPerSecond = 1 / Math.max(0.1, spec.growSeconds);
  field.nextCreaseId += 1;
  field.creases.push(crease);
  scratch.dirty = true;
}

/**
 * The minor fold whose line passes under the hand, if any. Only settled
 * folds count: one still growing is not yet something to iron out, and
 * the major skeleton stays system-owned.
 */
function creaseUnderPoint(
  field: CreaseFieldState,
  x: number,
  y: number,
): CreaseState | null {
  let best: CreaseState | null = null;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const crease of field.creases) {
    if (crease.kind !== "minor") continue;
    if (crease.strength < 0.08 || crease.growth < 0.6) continue;
    if (x < crease.minX || x > crease.maxX || y < crease.minY || y > crease.maxY) {
      continue;
    }
    const reach = crease.widthRatio * field.shortSide;
    const reachSquared = reach * reach;
    for (const point of crease.points) {
      const dx = point.x - x;
      const dy = point.y - y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared <= reachSquared && distanceSquared < bestDistanceSquared) {
        bestDistanceSquared = distanceSquared;
        best = crease;
      }
    }
  }
  return best;
}

/**
 * Picks the point (from a few candidates) farthest from every existing
 * fold - the most conscious patch of calm on the sheet.
 */
function calmestPoint(
  state: SimulationState,
  scratch: LifeScratch,
): { x: number; y: number } {
  const field = state.topology.creaseField!;
  let bestX = state.viewport.width * 0.5;
  let bestY = state.viewport.height * 0.5;
  let bestDistance = -1;

  for (let candidate = 0; candidate < 8; candidate += 1) {
    const x = state.viewport.width * (0.1 + scratch.random() * 0.8);
    const y = state.viewport.height * (0.1 + scratch.random() * 0.8);
    let nearestSquared = Number.POSITIVE_INFINITY;
    for (const crease of field.creases) {
      if (crease.strength <= 0.05) continue;
      for (let index = 0; index < crease.points.length; index += 4) {
        const point = crease.points[index]!;
        const dx = point.x - x;
        const dy = point.y - y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < nearestSquared) nearestSquared = distanceSquared;
      }
    }
    if (nearestSquared > bestDistance) {
      bestDistance = nearestSquared;
      bestX = x;
      bestY = y;
    }
  }

  return { x: bestX, y: bestY };
}

export const creaseLifeSystem: SimulationSystem = {
  name: "crease-life",
  update(state, config, deltaSeconds) {
    const field = state.topology.creaseField;
    const settings = config.crease;
    const life = settings?.life;
    if (!field || !settings || !life?.enabled) return;

    let scratch = scratchByState.get(state);
    if (!scratch) {
      scratch = {
        random: createRandom(config.topology.randomSeed ^ 0x51f15e),
        pressHeld: 0,
        pressFired: false,
        lastPointerX: 0,
        lastPointerY: 0,
        lastMoveDirectionX: 0,
        lastMoveDirectionY: 0,
        lastMoveAt: -1000,
        pressCooldownUntil: 0,
        nextSpawnAt: 0,
        nextMajorAt: 0,
        spawnInCalmNext: false,
        recomputeTimer: 0,
        dirty: false,
        lastPointerSeenAt: 0,
      };
      scratchByState.set(state, scratch);
    }
    const elapsed = state.time.elapsed;

    // Unwatched paper lives a little faster: after a while without a
    // pointer, upcoming events are pulled closer instead of rescheduled.
    if (state.pointer.isInside) scratch.lastPointerSeenAt = elapsed;
    const idleBoost = life.idleRateBoost ?? 1;
    if (idleBoost > 1 && elapsed - scratch.lastPointerSeenAt > 45) {
      const pull = (idleBoost - 1) * deltaSeconds;
      if (scratch.nextSpawnAt > 0) scratch.nextSpawnAt -= pull;
      if (scratch.nextMajorAt > 0) scratch.nextMajorAt -= pull;
    }

    // 1. Ageing: growth advances, fresh folds narrow as they set, healing
    // folds lose strength.
    for (const crease of field.creases) {
      crease.age += deltaSeconds;
      if (crease.growth < 1) {
        const rate =
          crease.growthPerSecond > 0 ? crease.growthPerSecond : 1 / life.growSeconds;
        crease.growth = Math.min(1, crease.growth + rate * deltaSeconds);
        scratch.dirty = true;
      }
      if (crease.maturitySeconds > 0 && crease.age < crease.maturitySeconds) {
        crease.widthRatio =
          crease.targetWidthRatio *
          (1.5 - 0.5 * clamp(crease.age / crease.maturitySeconds));
        scratch.dirty = true;
      } else if (crease.widthRatio !== crease.targetWidthRatio) {
        crease.widthRatio = crease.targetWidthRatio;
        scratch.dirty = true;
      }
      if (crease.fadePerSecond > 0 && crease.strength > 0) {
        crease.strength = Math.max(
          0,
          crease.strength - crease.fadePerSecond * deltaSeconds,
        );
        scratch.dirty = true;
      }
    }
    // Retire fully healed folds.
    for (let index = field.creases.length - 1; index >= 0; index -= 1) {
      const crease = field.creases[index]!;
      if (crease.strength <= 0.001) field.creases.splice(index, 1);
    }

    // 2. Minor events alternate between the crush zones and the calmest
    // region, so the composition truly reorganizes instead of piling up.
    if (scratch.nextSpawnAt === 0) {
      scratch.nextSpawnAt =
        elapsed + life.spawnIntervalSeconds * (0.5 + scratch.random() * 0.6);
    }
    if (elapsed >= scratch.nextSpawnAt) {
      scratch.nextSpawnAt =
        elapsed + life.spawnIntervalSeconds * (0.6 + scratch.random() * 0.8);
      const minors = field.creases.filter(
        (crease) => crease.kind === "minor" && crease.strength > 0.05,
      );

      if (scratch.random() < 0.35 && minors.length > 3) {
        // Press an existing fold flat over a few seconds.
        const victim = minors[Math.floor(scratch.random() * minors.length)]!;
        victim.fadePerSecond = Math.max(victim.fadePerSecond, victim.strength / 9);
      } else if (minors.length < life.maximumMinorCount) {
        let originX: number;
        let originY: number;
        if (scratch.spawnInCalmNext || field.crushZones.length === 0) {
          const calm = calmestPoint(state, scratch);
          originX = calm.x;
          originY = calm.y;
        } else {
          const zone =
            field.crushZones[Math.floor(scratch.random() * field.crushZones.length)]!;
          originX = zone.x + (scratch.random() - 0.5) * field.shortSide * 0.3;
          originY = zone.y + (scratch.random() - 0.5) * field.shortSide * 0.3;
        }
        scratch.spawnInCalmNext = !scratch.spawnInCalmNext;

        const strength = 0.5 + scratch.random() * 0.3;
        spawnFold(state, scratch, {
          originX,
          originY,
          kind: "minor",
          sign: scratch.random() < 0.65 ? -1 : 1,
          strength,
          halfLength: field.shortSide * 0.34 * (0.75 + scratch.random() * 0.5) * 0.5,
          widthRatio: 0.08,
          growSeconds: life.growSeconds,
          fadePerSecond: strength / (life.fadeSeconds * (0.8 + scratch.random() * 0.5)),
          maturitySeconds: life.growSeconds * 3,
        });
      }
    }

    // 3. The skeleton iterates on its own, much longer period: one major
    // fold hands over to a newly grown one.
    if (life.majorIntervalSeconds > 0) {
      if (scratch.nextMajorAt === 0) {
        scratch.nextMajorAt =
          elapsed + life.majorIntervalSeconds * (0.7 + scratch.random() * 0.6);
      }
      if (elapsed >= scratch.nextMajorAt) {
        scratch.nextMajorAt =
          elapsed + life.majorIntervalSeconds * (0.7 + scratch.random() * 0.6);
        const allMajors = field.creases.filter(
          (crease) => crease.kind === "major",
        );
        const stableMajors = allMajors.filter(
          (crease) => crease.fadePerSecond === 0,
        );
        // The skeleton count itself drifts: a handover sometimes only
        // retires, sometimes only grows, mostly swaps.
        const minimumMajors = life.minimumMajorCount ?? settings.majorCount;
        const maximumMajors = life.maximumMajorCount ?? settings.majorCount;
        const roll = scratch.random();
        const retireOnly =
          roll < 0.22 && allMajors.length > minimumMajors && stableMajors.length > 0;
        const growOnly =
          !retireOnly && roll < 0.44 && allMajors.length < maximumMajors;

        if (!growOnly && stableMajors.length > 0) {
          const retiring =
            stableMajors[Math.floor(scratch.random() * stableMajors.length)]!;
          retiring.fadePerSecond = retiring.strength / 45;
        }
        if (!retireOnly && (stableMajors.length > 0 || allMajors.length < maximumMajors)) {
          const diagonal = Math.hypot(state.viewport.width, state.viewport.height);
          spawnFold(state, scratch, {
            originX: state.viewport.width * (0.25 + scratch.random() * 0.5),
            originY: state.viewport.height * (0.25 + scratch.random() * 0.5),
            kind: "major",
            sign: scratch.random() < 0.5 ? 1 : -1,
            strength: 0.8 + scratch.random() * 0.2,
            halfLength: diagonal,
            widthRatio: settings.majorWidthRatio,
            growSeconds: life.growSeconds * 3,
            fadePerSecond: 0,
            maturitySeconds: life.growSeconds * 5,
          });
        }
      }
    }

    // 4. A patient press of the hand sets a new crease - oriented along
    // the last drag gesture, so the fold remembers the hand's direction.
    const pointer = state.pointer;
    if (config.fields.pointer.enabled) {
      const speed = Math.hypot(pointer.velocity.x, pointer.velocity.y);
      if (speed > 60) {
        scratch.lastMoveDirectionX = pointer.velocity.x / speed;
        scratch.lastMoveDirectionY = pointer.velocity.y / speed;
        scratch.lastMoveAt = elapsed;
      }
    }
    if (pointer.isDown && config.fields.pointer.enabled) {
      const drift = Math.hypot(
        pointer.position.x - scratch.lastPointerX,
        pointer.position.y - scratch.lastPointerY,
      );
      scratch.pressHeld =
        drift < field.shortSide * 0.02 ? scratch.pressHeld + deltaSeconds : 0;
      scratch.lastPointerX = pointer.position.x;
      scratch.lastPointerY = pointer.position.y;

      if (
        !scratch.pressFired &&
        scratch.pressHeld >= life.pressSeconds &&
        elapsed >= scratch.pressCooldownUntil
      ) {
        // Pressing on an existing fold irons it flat under the hand;
        // pressing open paper sets a new fold along the last gesture.
        const under = creaseUnderPoint(
          field,
          pointer.position.x,
          pointer.position.y,
        );
        if (under) {
          under.fadePerSecond = Math.max(under.fadePerSecond, under.strength / 6);
          scratch.dirty = true;
        } else {
          const useGesture = elapsed - scratch.lastMoveAt < 4;
          spawnFold(state, scratch, {
            originX: pointer.position.x,
            originY: pointer.position.y,
            directionX: useGesture ? scratch.lastMoveDirectionX : undefined,
            directionY: useGesture ? scratch.lastMoveDirectionY : undefined,
            kind: "minor",
            sign: -1,
            strength: 0.9,
            halfLength: field.shortSide * 0.15,
            widthRatio: 0.1,
            growSeconds: life.growSeconds * 0.7,
            fadePerSecond: 0.9 / (life.fadeSeconds * 1.4),
            maturitySeconds: life.growSeconds * 3,
          });
        }
        scratch.pressFired = true;
        scratch.pressCooldownUntil = elapsed + 6;
      }
    } else {
      scratch.pressHeld = 0;
      scratch.pressFired = false;
    }

    // 5. Re-derive the rest pose from the evolved field, at 20 Hz.
    scratch.recomputeTimer += deltaSeconds;
    if (!scratch.dirty || scratch.recomputeTimer < 0.05) return;
    scratch.recomputeTimer = 0;
    scratch.dirty = false;

    const { nodes, edges } = state.topology;
    for (const node of nodes) {
      const z = evaluateCreaseField(node.restPosition.x, node.restPosition.y, field);
      node.restPosition.z = z;
      if (node.pinned) {
        // Pinned rim nodes never integrate; move them with the field so
        // border springs stay consistent.
        node.position.z = z;
        node.previousPosition.z = z;
      }
    }
    for (const edge of edges) {
      const a = nodes[edge.nodeA]!;
      const b = nodes[edge.nodeB]!;
      const restLength = Math.hypot(
        b.restPosition.x - a.restPosition.x,
        b.restPosition.y - a.restPosition.y,
        b.restPosition.z - a.restPosition.z,
      );
      edge.restLength = restLength;
      edge.baseRestLength = restLength;
    }
  },
};
