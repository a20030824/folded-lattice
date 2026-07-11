import type { SimulationSystem } from "../contracts";
import { clamp, hash01, valueNoise2D } from "../math";
import type { GrainFieldState, SimulationState } from "../state";

/**
 * Seconds for combed alignment to loosen back toward chaos.
 */
const ALIGN_DECAY_TAU = 75;
/**
 * Hand-combed marks read as fresher messages and fade a bit sooner.
 */
const HANDMARK_DECAY_TAU = 45;
/**
 * The creature's own combing never reaches full alignment; only the
 * hand lays down saturated strokes. This is how it tells a message
 * from its own footprints.
 */
const CREATURE_ALIGN_CAP = 0.75;
/**
 * Minimum pointer speed (px/s) for a drag to comb; a resting finger
 * has no direction to give.
 */
const COMB_DRAG_SPEED = 40;

function ensureGrain(state: SimulationState): GrainFieldState {
  const count = state.topology.triangles.length;
  if (!state.grain || state.grain.angle.length !== count) {
    const angle = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      angle[index] = hash01(index * 2654435761) * Math.PI;
    }
    state.grain = {
      angle,
      align: new Float32Array(count),
      handmark: new Float32Array(count),
    };
  }
  return state.grain;
}

/**
 * Blend an orientation (mod PI) toward a target orientation. Uses the
 * angle-doubling trick so 178° and 2° are neighbours, not opposites.
 */
function blendOrientation(current: number, target: number, weight: number): number {
  const cx =
    (1 - weight) * Math.cos(current * 2) + weight * Math.cos(target * 2);
  const cy =
    (1 - weight) * Math.sin(current * 2) + weight * Math.sin(target * 2);
  if (cx * cx + cy * cy < 1e-9) return target;
  let blended = Math.atan2(cy, cx) / 2;
  if (blended < 0) blended += Math.PI;
  return blended;
}

/**
 * The sheet's grain: a direction on every facet, combed by whatever
 * moves across it. The wandering line orders the space it has been
 * through; a dragging hand writes a current the creature can read.
 * Order decays back into noise - the world forgets by loosening.
 */
export const grainCombSystem: SimulationSystem = {
  name: "grain-comb",
  update(state, config, deltaSeconds) {
    if (!config.creature?.enabled) return;
    const grain = ensureGrain(state);
    const triangles = state.topology.triangles;
    const shortSide = Math.max(
      1,
      Math.min(state.viewport.width, state.viewport.height),
    );
    const time = state.time.elapsed;

    const alignDecay = Math.exp(-deltaSeconds / ALIGN_DECAY_TAU);
    const handDecay = Math.exp(-deltaSeconds / HANDMARK_DECAY_TAU);

    // Creature comb: recent body samples define a local direction.
    const creature = state.creature;
    const points = creature?.points ?? [];
    const count = points.length;
    const combRadius = shortSide * 0.045;
    const combSquared = combRadius * combRadius;
    const rejectSquared = combSquared * 9;

    // Pointer comb: a moving pressed finger lays a saturated stroke.
    const pointer = state.pointer;
    const dragSpeed = Math.hypot(pointer.velocity.x, pointer.velocity.y);
    const handCombing =
      pointer.isDown && pointer.isInside && dragSpeed > COMB_DRAG_SPEED;
    const handAngleRaw = Math.atan2(pointer.velocity.y, pointer.velocity.x);
    const handAngle =
      handAngleRaw < 0 ? handAngleRaw + Math.PI : handAngleRaw;
    const handRadius = shortSide * 0.055;
    const handSquared = handRadius * handRadius;

    for (let index = 0; index < triangles.length; index += 1) {
      const center = triangles[index]!.center;

      // Loosening: alignment decays, and the freed grain wanders.
      let align = grain.align[index]! * alignDecay;
      grain.handmark[index]! > 0.001
        ? (grain.handmark[index] = grain.handmark[index]! * handDecay)
        : (grain.handmark[index] = 0);
      if (align < 0.001) align = 0;
      grain.angle[index] =
        grain.angle[index]! +
        (valueNoise2D(index * 0.37, time * 0.06) - 0.5) *
          deltaSeconds *
          0.4 *
          (1 - align);
      if (grain.angle[index]! < 0) grain.angle[index]! += Math.PI;
      if (grain.angle[index]! >= Math.PI) grain.angle[index]! -= Math.PI;

      // Body comb: nearest recent segment gives direction & pressure.
      if (count > 2) {
        let strength = 0;
        let nearestK = -1;
        for (let back = 1; back < 30 && back < count - 1; back += 3) {
          const point = points[count - 1 - back]!;
          const dx = center.x - point.x;
          const dy = center.y - point.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared > rejectSquared) continue;
          const s = Math.exp(-distanceSquared / combSquared);
          if (s > strength) {
            strength = s;
            nearestK = count - 1 - back;
          }
        }
        if (strength > 0.03 && nearestK > 0 && nearestK < count - 1) {
          const before = points[nearestK - 1]!;
          const after = points[nearestK + 1]!;
          const rawAngle = Math.atan2(after.y - before.y, after.x - before.x);
          const pathAngle = rawAngle < 0 ? rawAngle + Math.PI : rawAngle;
          const weight = clamp(strength * deltaSeconds * 9);
          grain.angle[index] = blendOrientation(
            grain.angle[index]!,
            pathAngle,
            weight,
          );
          align = Math.max(
            align,
            Math.min(
              CREATURE_ALIGN_CAP,
              align + strength * deltaSeconds * 6,
            ),
          );
        }
      }

      if (handCombing) {
        const hx = center.x - pointer.position.x;
        const hy = center.y - pointer.position.y;
        const handDistanceSquared = hx * hx + hy * hy;
        if (handDistanceSquared < handSquared * 9) {
          const s = Math.exp(-handDistanceSquared / handSquared);
          const weight = clamp(s * deltaSeconds * 24);
          grain.angle[index] = blendOrientation(
            grain.angle[index]!,
            handAngle,
            weight,
          );
          align = clamp(align + s * deltaSeconds * 12);
          grain.handmark[index] = clamp(
            grain.handmark[index]! + s * deltaSeconds * 10,
          );
        }
      }

      grain.align[index] = align;
    }
  },
};
