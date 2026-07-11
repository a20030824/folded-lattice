import type { SimulationSystem } from "../contracts";
import { createRandom } from "../math";
import type { EdgeState, NodeState, SimulationState } from "../state";

/**
 * How quickly the warm front cools once it has passed an edge; the
 * lasting trace is carried by edge.memory, not by this channel.
 */
const PULSE_COOLING_PER_SECOND = 1.7;

interface PulseScratch {
  random: () => number;
  edgesRef: EdgeState[] | null;
  nodeDistance: Float32Array;
  edgeDistance: Float32Array;
  active: boolean;
  age: number;
  maxDistance: number;
  waitSeconds: number;
  scheduled: boolean;
  pointerWasDown: boolean;
  visualFront: boolean;
}

const scratchByState = new WeakMap<SimulationState, PulseScratch>();

function getScratch(state: SimulationState, seed: number): PulseScratch {
  let scratch = scratchByState.get(state);
  if (!scratch) {
    scratch = {
      random: createRandom(seed ^ 0x9e3779b9),
      edgesRef: null,
      nodeDistance: new Float32Array(0),
      edgeDistance: new Float32Array(0),
      active: false,
      age: 0,
      maxDistance: 0,
      waitSeconds: 0,
      scheduled: false,
      pointerWasDown: false,
      visualFront: false,
    };
    scratchByState.set(state, scratch);
  }
  if (scratch.edgesRef !== state.topology.edges) {
    scratch.edgesRef = state.topology.edges;
    scratch.nodeDistance = new Float32Array(state.topology.nodes.length);
    scratch.edgeDistance = new Float32Array(state.topology.edges.length);
    scratch.active = false;
    scratch.scheduled = false;
    scratch.pointerWasDown = false;
  }
  return scratch;
}

/**
 * The membrane remembers where it was touched: tension deposited by the
 * pointer lingers as edge memory, and pulses prefer to be born there.
 */
function pickOrigin(
  nodes: NodeState[],
  edges: EdgeState[],
  scratch: PulseScratch,
  memoryOriginChance: number,
): number {
  if (scratch.random() < memoryOriginChance) {
    let bestNode = -1;
    let bestMemory = 0.15;
    for (const node of nodes) {
      if (node.pinned) continue;
      let total = 0;
      for (const edgeIndex of node.edgeIndices) {
        total += edges[edgeIndex]?.memory ?? 0;
      }
      if (total > bestMemory) {
        bestMemory = total;
        bestNode = node.id;
      }
    }
    if (bestNode >= 0) return bestNode;
  }
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = Math.floor(scratch.random() * nodes.length);
    if (!nodes[candidate]?.pinned) return candidate;
  }
  return 0;
}

function spawnPulse(
  state: SimulationState,
  scratch: PulseScratch,
  origin: number,
  visualFront: boolean,
): void {
  const { nodes, edges } = state.topology;
  const distance = scratch.nodeDistance;
  distance.fill(Number.POSITIVE_INFINITY);
  distance[origin] = 0;

  // Dijkstra over rest lengths; the node count is small enough that the
  // quadratic scan is cheaper than maintaining a heap.
  const settled = new Uint8Array(nodes.length);
  for (let round = 0; round < nodes.length; round += 1) {
    let current = -1;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < nodes.length; index += 1) {
      const d = distance[index] ?? Number.POSITIVE_INFINITY;
      if (!settled[index] && d < currentDistance) {
        current = index;
        currentDistance = d;
      }
    }
    if (current < 0) break;
    settled[current] = 1;
    const node = nodes[current];
    if (!node) continue;
    for (const edgeIndex of node.edgeIndices) {
      const edge = edges[edgeIndex];
      if (!edge) continue;
      const other = edge.nodeA === current ? edge.nodeB : edge.nodeA;
      const next = currentDistance + edge.baseRestLength;
      if (next < (distance[other] ?? Number.POSITIVE_INFINITY)) distance[other] = next;
    }
  }

  let maxDistance = 0;
  for (let index = 0; index < nodes.length; index += 1) {
    const d = distance[index] ?? 0;
    if (Number.isFinite(d) && d > maxDistance) maxDistance = d;
  }
  for (let index = 0; index < edges.length; index += 1) {
    const edge = edges[index]!;
    scratch.edgeDistance[index] =
      ((distance[edge.nodeA] ?? 0) + (distance[edge.nodeB] ?? 0)) * 0.5;
  }

  scratch.maxDistance = maxDistance;
  scratch.active = true;
  scratch.age = 0;
  scratch.visualFront = visualFront;
}

export const membranePulseSystem: SimulationSystem = {
  name: "membrane-pulse",
  update(state, config, deltaSeconds) {
    const settings = config.pulse;
    if (!settings?.enabled) return;
    const { nodes, edges } = state.topology;
    if (nodes.length === 0) return;

    const scratch = getScratch(state, config.topology.randomSeed);
    const cooling = Math.exp(-PULSE_COOLING_PER_SECOND * deltaSeconds);
    for (const edge of edges) {
      if (edge.pulse > 0.0005) edge.pulse *= cooling;
    }

    const pointerDown = state.pointer.isInside && state.pointer.isDown;
    const pointerIgnited =
      settings.pointerTrigger && pointerDown && !scratch.pointerWasDown;
    scratch.pointerWasDown = pointerDown;
    if (pointerIgnited) {
      let nearest = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const node of nodes) {
        if (node.pinned) continue;
        const dx = node.position.x - state.pointer.position.x;
        const dy = node.position.y - state.pointer.position.y;
        const distance = dx * dx + dy * dy;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = node.id;
        }
      }
      if (nearest >= 0) {
        spawnPulse(state, scratch, nearest, true);
        scratch.scheduled = true;
        scratch.waitSeconds = settings.intervalSeconds;
      }
    }

    if (!scratch.active) {
      if (!scratch.scheduled) {
        // First pulse arrives early so a freshly set wallpaper shows its
        // event within the first half minute.
        scratch.waitSeconds = settings.intervalSeconds * 0.3;
        scratch.scheduled = true;
      }
      scratch.waitSeconds -= deltaSeconds;
      if (scratch.waitSeconds > 0) return;
      spawnPulse(
        state,
        scratch,
        pickOrigin(nodes, edges, scratch, settings.memoryOriginChance),
        false,
      );
      return;
    }

    const shortSide = Math.max(
      1,
      Math.min(state.viewport.width, state.viewport.height),
    );
    const speed = settings.speedRatio * shortSide;
    const band = Math.max(1, settings.bandRatio * shortSide);
    const falloff = Math.max(1, settings.falloffRatio * shortSide);
    scratch.age += deltaSeconds;
    const radius = scratch.age * speed;

    const maximumMemory = config.memory.maximumMemory;
    for (let index = 0; index < edges.length; index += 1) {
      const edgeDistance = scratch.edgeDistance[index] ?? 0;
      const normalized = (edgeDistance - radius) / band;
      if (normalized * normalized > 9) continue;
      const signal =
        Math.exp(-normalized * normalized) * Math.exp(-edgeDistance / falloff);
      const edge = edges[index]!;
      const visibleSignal = scratch.visualFront
        ? signal
        : 0;
      if (visibleSignal > edge.pulse) edge.pulse = visibleSignal;
      edge.memory = Math.min(
        maximumMemory,
        edge.memory + settings.memoryDeposit * signal * deltaSeconds,
      );
    }

    if (settings.kickStrength > 0) {
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index]!;
        if (node.pinned) continue;
        const nodeDistance = scratch.nodeDistance[index] ?? 0;
        const normalized = (nodeDistance - radius) / band;
        if (normalized * normalized > 9) continue;
        // A heartbeat is biphasic: the leading half lifts and the trailing
        // half pulls back. Its temporal integral is near zero, so repeated
        // pulses ring the membrane instead of slowly inflating it.
        node.force.z +=
          settings.kickStrength *
          normalized *
          Math.exp(-normalized * normalized) *
          Math.exp(-nodeDistance / falloff);
      }
    }

    // Done once the front has left the membrane or attenuated to nothing.
    if (radius > Math.min(scratch.maxDistance, falloff * 3.2) + band * 3) {
      scratch.active = false;
      scratch.waitSeconds = settings.intervalSeconds * (0.7 + scratch.random() * 0.6);
    }
  },
};
