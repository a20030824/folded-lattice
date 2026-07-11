import type { SimulationSystem } from "../contracts";
import { clamp } from "../math";
import type { SimulationState } from "../state";

/**
 * Seconds for soaked ink to dry out of a fibre once nothing feeds it.
 */
const DRY_TAU = 130;
/**
 * Diffusion rate toward the neighbourhood level, per second. Slow on
 * purpose: the ink CREEPS outward, a visible bleeding, not a flood.
 */
const WICK_RATE = 0.9;
/**
 * How far off the body's spine an edge can drink, as a ratio of the
 * short side.
 */
const DRINK_RADIUS_RATIO = 0.02;

function ensureInk(state: SimulationState): Float32Array {
  const count = state.topology.edges.length;
  if (!state.edgeInk || state.edgeInk.length !== count) {
    state.edgeInk = new Float32Array(count);
  }
  return state.edgeInk;
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
    if (!config.creature?.enabled) return;
    const ink = ensureInk(state);
    const { nodes, edges } = state.topology;
    const shortSide = Math.max(
      1,
      Math.min(state.viewport.width, state.viewport.height),
    );

    // Each node carries the mean ink of its fibres; edges then relax
    // toward the mean of their two endpoints. Together with drying,
    // this is a slow leak outward along the web.
    const nodeInk = new Float32Array(nodes.length);
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

    // Fibres under the body drink fresh ink; the slow rear half of
    // the body (older ink) feeds them hardest, the crisp head barely
    // wets the ground - new ink does not bleed, old ink does.
    const creature = state.creature;
    const points = creature?.points ?? [];
    const count = points.length;
    if (count > 4) {
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
        for (let back = 4; back < 60 && back < count; back += 4) {
          const point = points[count - 1 - back]!;
          const dx = midX - point.x;
          const dy = midY - point.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared > rejectSquared) continue;
          // Age along the body: the tail end has soaked longest.
          const age = back / Math.min(60, count);
          const s = Math.exp(-distanceSquared / drinkSquared) * (0.25 + 0.75 * age);
          if (s > drink) drink = s;
        }
        if (drink > 0.02) {
          ink[index] = clamp(
            ink[index]! + drink * deltaSeconds * 2.2,
            0,
            1,
          );
        }
      }
    }
  },
};
