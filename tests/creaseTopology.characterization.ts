import { createEngine } from "../src/core/createEngine";
import { createEmptySimulationState } from "../src/core/state";
import { getCreaseRuntime } from "../src/features/crease/state";
import { creaseLifeSystem } from "../src/core/simulation/creaseLife";
import {
  creaseTopologyBuilder,
  rebuildTopologyPreservingMotion,
} from "../src/core/topology/creaseTopology";
import { crumpledPaperPreset } from "../src/presets/crumpledPaper";
import type { TopologyState } from "../src/core/state";

const viewport = { width: 320, height: 240, devicePixelRatio: 1 };
const config = crumpledPaperPreset.createConfig();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertFinite(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} is not finite`);
}

function signature(topology: TopologyState): string {
  return JSON.stringify({
    nodes: topology.nodes.map((node) => [node.position.x, node.position.y, node.position.z]),
    edges: topology.edges.map((edge) => [edge.nodeA, edge.nodeB]),
    triangles: topology.triangles.map((triangle) => [
      triangle.nodeA,
      triangle.nodeB,
      triangle.nodeC,
      triangle.edgeA,
      triangle.edgeB,
      triangle.edgeC,
    ]),
  });
}

function assertValidTopology(topology: TopologyState, runtime: ReturnType<typeof getCreaseRuntime>): void {
  const creaseNodeCount = runtime.nodeTags.filter((tag) => tag).length;
  assert(creaseNodeCount > 0, "crease topology has no tagged nodes");

  for (const edge of topology.edges) {
    assert(edge.nodeA >= 0 && edge.nodeA < topology.nodes.length, "edge nodeA is invalid");
    assert(edge.nodeB >= 0 && edge.nodeB < topology.nodes.length, "edge nodeB is invalid");
  }
  for (const triangle of topology.triangles) {
    for (const nodeIndex of [triangle.nodeA, triangle.nodeB, triangle.nodeC]) {
      assert(nodeIndex >= 0 && nodeIndex < topology.nodes.length, "triangle node index is invalid");
    }
    for (const edgeIndex of [triangle.edgeA, triangle.edgeB, triangle.edgeC]) {
      assert(edgeIndex >= 0 && edgeIndex < topology.edges.length, "triangle edge index is invalid");
    }
  }
  for (const crease of runtime.creaseEdges) {
    assert(crease.edgeIndex >= 0 && crease.edgeIndex < topology.edges.length, "crease edge index is invalid");
    assert(
      crease.triangleA >= -1 && crease.triangleA < topology.triangles.length,
      "crease triangleA index is invalid",
    );
    assert(
      crease.triangleB >= -1 && crease.triangleB < topology.triangles.length,
      "crease triangleB index is invalid",
    );
  }
}

function assertFiniteTopology(
  topology: TopologyState,
  runtime: ReturnType<typeof getCreaseRuntime>,
): void {
  for (const node of topology.nodes) {
    for (const value of [
      node.position.x,
      node.position.y,
      node.position.z,
      node.velocity.x,
      node.velocity.y,
      node.velocity.z,
    ]) assertFinite(value, "crease node value");
  }
  for (const crease of runtime.creaseField.creases) {
    for (const value of [crease.strength, crease.growth, crease.age]) {
      assertFinite(value, "crease life value");
    }
  }
}

const firstResult = creaseTopologyBuilder.build(viewport, config);
const secondResult = creaseTopologyBuilder.build(viewport, config);
assert(
  signature(firstResult.topology) === signature(secondResult.topology),
  "crease topology is not deterministic",
);

const state = createEmptySimulationState(viewport);
state.topology = firstResult.topology;
firstResult.initializeResources?.(state.resources);
let runtime = getCreaseRuntime(state);
assertValidTopology(state.topology, runtime);
creaseLifeSystem.update(state, config, 1 / 60);
assertFiniteTopology(state.topology, runtime);

rebuildTopologyPreservingMotion(state, config);
assert(state.topology.nodes.length > 0, "rebuild produced no nodes");
assert(state.topology.edges.length > 0, "rebuild produced no edges");
assert(state.topology.triangles.length > 0, "rebuild produced no triangles");
runtime = getCreaseRuntime(state);
assertValidTopology(state.topology, runtime);
assertFiniteTopology(state.topology, runtime);

Object.assign(globalThis, {
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
});
const engine = createEngine(
  crumpledPaperPreset,
  crumpledPaperPreset.createConfig(),
  { resize() {}, render() {}, dispose() {} },
  viewport,
);
const initialEngineRuntime = getCreaseRuntime(engine.getState());
engine.rebuildTopology();
assert(
  getCreaseRuntime(engine.getState()) !== initialEngineRuntime,
  "engine rebuild retained stale crease runtime",
);
engine.dispose();

console.log("crease topology characterization passed");
