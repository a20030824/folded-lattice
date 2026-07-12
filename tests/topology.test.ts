import { describe, expect, it } from "vitest";
import { createEmptySimulationState } from "../src/core/state";
import { getCreaseRuntime } from "../src/features/crease/state";
import { resolvePreset } from "../src/presets/registry";
import type { TopologyState } from "../src/core/state";

const viewport = { width: 320, height: 240, devicePixelRatio: 1 };

function topologySignature(topology: TopologyState): string {
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

function expectFiniteTopology(topology: TopologyState): void {
  for (const node of topology.nodes) {
    for (const value of [
      node.position.x,
      node.position.y,
      node.position.z,
      node.velocity.x,
      node.velocity.y,
      node.velocity.z,
      node.force.x,
      node.force.y,
      node.force.z,
    ]) expect(Number.isFinite(value)).toBe(true);
  }
}

function expectValidTopology(topology: TopologyState): void {
  expect(topology.nodes.length).toBeGreaterThan(0);
  expect(topology.edges.length).toBeGreaterThan(0);
  expect(topology.triangles.length).toBeGreaterThan(0);

  for (const node of topology.nodes) {
    for (const edgeIndex of node.edgeIndices) {
      expect(edgeIndex).toBeGreaterThanOrEqual(0);
      expect(edgeIndex).toBeLessThan(topology.edges.length);
    }
    for (const triangleIndex of node.triangleIndices) {
      expect(triangleIndex).toBeGreaterThanOrEqual(0);
      expect(triangleIndex).toBeLessThan(topology.triangles.length);
    }
  }
  for (const edge of topology.edges) {
    expect(edge.nodeA).toBeGreaterThanOrEqual(0);
    expect(edge.nodeA).toBeLessThan(topology.nodes.length);
    expect(edge.nodeB).toBeGreaterThanOrEqual(0);
    expect(edge.nodeB).toBeLessThan(topology.nodes.length);
  }
  for (const triangle of topology.triangles) {
    for (const nodeIndex of [triangle.nodeA, triangle.nodeB, triangle.nodeC]) {
      expect(nodeIndex).toBeGreaterThanOrEqual(0);
      expect(nodeIndex).toBeLessThan(topology.nodes.length);
    }
    for (const edgeIndex of [triangle.edgeA, triangle.edgeB, triangle.edgeC]) {
      expect(edgeIndex).toBeGreaterThanOrEqual(0);
      expect(edgeIndex).toBeLessThan(topology.edges.length);
    }
    for (const neighborIndex of triangle.neighborIndices) {
      expect(neighborIndex).toBeGreaterThanOrEqual(0);
      expect(neighborIndex).toBeLessThan(topology.triangles.length);
      expect(topology.triangles[neighborIndex]!.neighborIndices).toContain(triangle.id);
    }
  }
}

describe("topology builders", () => {
  it.each([
    "crumpled-paper",
    "wandering-ink",
    "breathing-membrane",
    "tide-archive",
  ])("is deterministic and valid for %s", (name) => {
    const preset = resolvePreset(name);
    const first = preset.topologyBuilder.build(viewport, preset.createConfig());
    const second = preset.topologyBuilder.build(viewport, preset.createConfig());
    expect(topologySignature(first.topology)).toBe(topologySignature(second.topology));
    expectValidTopology(first.topology);
    expectFiniteTopology(first.topology);

    const state = createEmptySimulationState(viewport);
    state.topology = first.topology;
    first.initializeResources?.(state.resources);
    if (name === "crumpled-paper" || name === "tide-archive") {
      const runtime = getCreaseRuntime(state);
      expect(runtime.nodeTags.length).toBe(first.topology.nodes.length);
      expect(runtime.nodeTags.some((tag) => tag)).toBe(true);
      for (const crease of runtime.creaseEdges) {
        expect(crease.edgeIndex).toBeLessThan(first.topology.edges.length);
        expect(crease.triangleA).toBeLessThan(first.topology.triangles.length);
        expect(crease.triangleB).toBeLessThan(first.topology.triangles.length);
      }
    }
  });
});
