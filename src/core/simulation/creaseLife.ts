import type { SimulationSystem } from "../contracts";
import { createRandom } from "../math";
import type { SimulationState } from "../state";
import {
  buildCreaseState,
  evaluateCreaseField,
  walkCreasePoints,
} from "../topology/creaseTopology";

/**
 * Gives the fold network a life cycle. New creases grow tip-forward across
 * the sheet, mature ones slowly heal or get pressed flat, and holding the
 * pointer down long enough sets a fresh fold under the hand. The rest pose
 * is re-derived from the evolving field, so the paper's shading, physics,
 * and history all follow one mechanism.
 */

interface LifeScratch {
  random: () => number;
  pressHeld: number;
  pressFired: boolean;
  lastPointerX: number;
  lastPointerY: number;
  pressCooldownUntil: number;
  nextSpawnAt: number;
  recomputeTimer: number;
  dirty: boolean;
}

const scratchByState = new WeakMap<SimulationState, LifeScratch>();

function spawnFold(
  state: SimulationState,
  scratch: LifeScratch,
  originX: number,
  originY: number,
  sign: 1 | -1,
  strength: number,
  fadeSeconds: number,
  lengthRatio: number,
  widthRatio: number,
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

  const angle = random() * Math.PI * 2;
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const curvature = (random() - 0.5) * 0.09;
  const step = shortSide * 0.04;
  const half = shortSide * lengthRatio * (0.75 + random() * 0.5) * 0.5;

  // Grow both ways from the origin so the fold sets under the event point.
  const forward = walkCreasePoints(
    originX, originY, directionX, directionY,
    half, step, shortSide * 0.008, curvature, bounds, random,
  );
  const backward = walkCreasePoints(
    originX, originY, -directionX, -directionY,
    half, step, shortSide * 0.008, -curvature, bounds, random,
  );
  const points = [...backward.slice(1).reverse(), ...forward];
  if (points.length < 3) return;

  // Runtime folds are wider than baked ones: the mesh is coarse in calm
  // regions and a narrow tent would fall between nodes unseen.
  const crease = buildCreaseState(
    field.nextCreaseId,
    "minor",
    sign,
    strength,
    widthRatio,
    points,
    shortSide,
    0,
    strength / (fadeSeconds * (0.8 + random() * 0.5)),
  );
  field.nextCreaseId += 1;
  field.creases.push(crease);
  scratch.dirty = true;
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
        pressCooldownUntil: 0,
        nextSpawnAt: 0,
        recomputeTimer: 0,
        dirty: false,
      };
      scratchByState.set(state, scratch);
    }
    const elapsed = state.time.elapsed;

    // 1. Ageing: growth advances, healing folds lose strength.
    for (const crease of field.creases) {
      crease.age += deltaSeconds;
      if (crease.growth < 1) {
        crease.growth = Math.min(1, crease.growth + deltaSeconds / life.growSeconds);
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
      if (crease.kind === "minor" && crease.strength <= 0.001) {
        field.creases.splice(index, 1);
      }
    }

    // 2. Spontaneous events: a new fold grows, or an old one is pressed flat.
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
        const zone =
          field.crushZones[Math.floor(scratch.random() * field.crushZones.length)];
        const nearZone = zone && scratch.random() < 0.55;
        const originX = nearZone
          ? zone.x + (scratch.random() - 0.5) * field.shortSide * 0.3
          : state.viewport.width * (0.15 + scratch.random() * 0.7);
        const originY = nearZone
          ? zone.y + (scratch.random() - 0.5) * field.shortSide * 0.3
          : state.viewport.height * (0.15 + scratch.random() * 0.7);
        spawnFold(
          state,
          scratch,
          originX,
          originY,
          scratch.random() < 0.65 ? -1 : 1,
          0.5 + scratch.random() * 0.3,
          life.fadeSeconds,
          0.34,
          0.08,
        );
      }
    }

    // 3. A patient press of the hand sets a new crease.
    const pointer = state.pointer;
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
        spawnFold(
          state,
          scratch,
          pointer.position.x,
          pointer.position.y,
          -1,
          0.9,
          life.fadeSeconds * 1.4,
          0.3,
          0.1,
        );
        scratch.pressFired = true;
        scratch.pressCooldownUntil = elapsed + 6;
      }
    } else {
      scratch.pressHeld = 0;
      scratch.pressFired = false;
    }

    // 4. Re-derive the rest pose from the evolved field, at 20 Hz.
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
