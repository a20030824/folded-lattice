import type { SimulationSystem } from "../../core/contracts";
import { clamp } from "../../core/math";
import { creatureConfigKey } from "./config";
import { getInkRuntime } from "./state";
import type { SimulationState } from "../../core/state";

/**
 * Seconds for soaked ink to dry out of a fibre once nothing feeds it.
 * Short on purpose (judge's call): the veins are a breath that
 * follows the body, not an archive.
 */
const DRY_TAU = 9;
/**
 * Diffusion rate toward the neighbourhood level, per second. Slow on
 * purpose: the ink CREEPS outward, a visible bleeding, not a flood.
 */
const WICK_RATE = 0.45;
/**
 * How far off the body's spine an edge can drink, as a ratio of the
 * short side.
 */
const DRINK_RADIUS_RATIO = 0.02;

function ensureInk(state: SimulationState): Float32Array {
  const runtime = getInkRuntime(state);
  const count = state.topology.edges.length;
  if (!runtime.edgeInk || runtime.edgeInk.length !== count) {
    runtime.edgeInk = new Float32Array(count);
  }
  return runtime.edgeInk;
}

/**
 * The lattice is the paper's fibre structure, and it drinks. Edges
 * under the passing body soak up ink; each fibre then slowly shares
 * with the fibres it meets at its endpoints, so the stain spreads
 * strand by strand along the web, thinning and drying as it goes.
 * The desk keeps a branching, vein-like map of where the line lived.
 */
export const inkWickSystem: SimulationSystem = {
  name: "ink-wick",
  update(state, config, deltaSeconds) {
    const settings = config.modules.require(creatureConfigKey);
    if (!settings.enabled) return;
    const runtime = getInkRuntime(state);
    const ink = ensureInk(state);
    const { nodes, edges } = state.topology;
    const shortSide = Math.max(
      1,
      Math.min(state.viewport.width, state.viewport.height),
    );

    // Each node carries the mean ink of its fibres; edges then relax
    // toward the mean of their two endpoints. Together with drying,
    // this is a slow leak outward along the web.
    if (!runtime.wickScratch || runtime.wickScratch.length !== nodes.length) {
      runtime.wickScratch = new Float32Array(nodes.length);
    }
    const nodeInk = runtime.wickScratch;
    nodeInk.fill(0);
    for (let index = 0; index < nodes.length; index += 1) {
      const incident = nodes[index]!.edgeIndices;
      if (incident.length === 0) continue;
      let sum = 0;
      for (const edgeIndex of incident) sum += ink[edgeIndex]!;
      nodeInk[index] = sum / incident.length;
    }
    const dry = Math.exp(-deltaSeconds / DRY_TAU);
    const wick = clamp(WICK_RATE * deltaSeconds);
    for (let index = 0; index < edges.length; index += 1) {
      const edge = edges[index]!;
      const neighbourhood =
        (nodeInk[edge.nodeA]! + nodeInk[edge.nodeB]!) * 0.5;
      const level = ink[index]!;
      ink[index] = (level + (neighbourhood - level) * wick) * dry;
      if (ink[index]! < 0.001) ink[index] = 0;
    }

    // Only the far tail of the body wets the ground: ink needs time
    // to soak through, so the fibres light up where the line WAS
    // seconds ago, never under the crisp head. The delay is physical -
    // the tail arrives there long after the head has left.
    const creature = runtime.creature;
    const points = creature?.points ?? [];
    const count = points.length;
    if (count > 64) {
      const drinkRadius = DRINK_RADIUS_RATIO * shortSide;
      const drinkSquared = drinkRadius * drinkRadius;
      const rejectSquared = drinkSquared * 9;
      for (let index = 0; index < edges.length; index += 1) {
        const edge = edges[index]!;
        const a = nodes[edge.nodeA]!.position;
        const b = nodes[edge.nodeB]!.position;
        const midX = (a.x + b.x) * 0.5;
        const midY = (a.y + b.y) * 0.5;
        let drink = 0;
        for (let back = 56; back < 144 && back < count; back += 8) {
          const point = points[count - 1 - back]!;
          const dx = midX - point.x;
          const dy = midY - point.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared > rejectSquared) continue;
          // Age along the body: the tail end has soaked longest.
          const age = back / Math.min(144, count);
          const s = Math.exp(-distanceSquared / drinkSquared) * age;
          if (s > drink) drink = s;
        }
        if (drink > 0.02) {
          ink[index] = clamp(
            ink[index]! + drink * deltaSeconds * 1.3,
            0,
            1,
          );
        }
      }
    }
  },
};
