import { describe, expect, it } from "vitest";
import { ResourceStore } from "../src/core/resources";
import { createEmptySimulationState } from "../src/core/state";
import {
  membranePulseRuntimeKey,
} from "../src/features/membrane/state";
import { breathingMembranePreset } from "../src/presets/breathingMembrane";
import { crumpledPaperPreset } from "../src/presets/crumpledPaper";

const viewport = { width: 320, height: 240, devicePixelRatio: 1 };

describe("membrane pulse runtime", () => {
  it("initializes a pulse resource for the membrane topology", () => {
    const config = breathingMembranePreset.createConfig();
    const result = breathingMembranePreset.topologyBuilder.build(viewport, config);
    const resources = new ResourceStore();

    result.initializeResources?.(resources);

    const runtime = resources.require(membranePulseRuntimeKey);
    expect(runtime.topology).toBe(result.topology);
    expect(runtime.edgePulse).toHaveLength(result.topology.edges.length);
    expect(Array.from(runtime.edgePulse)).toEqual(
      new Array(result.topology.edges.length).fill(0),
    );
  });

  it("replaces the pulse runtime when topology is rebuilt", () => {
    const config = breathingMembranePreset.createConfig();
    const state = createEmptySimulationState(viewport);
    const first = breathingMembranePreset.topologyBuilder.build(viewport, config);

    state.topology = first.topology;
    first.initializeResources?.(state.resources);
    const oldRuntime = state.resources.require(membranePulseRuntimeKey);
    oldRuntime.edgePulse[0] = 1;

    config.topology.nodeCount -= 20;
    const second = breathingMembranePreset.topologyBuilder.build(viewport, config);
    state.topology = second.topology;
    second.initializeResources?.(state.resources);

    const newRuntime = state.resources.require(membranePulseRuntimeKey);
    expect(newRuntime).not.toBe(oldRuntime);
    expect(newRuntime.topology).toBe(second.topology);
    expect(newRuntime.edgePulse).toHaveLength(second.topology.edges.length);
    expect(Array.from(newRuntime.edgePulse)).toEqual(
      new Array(second.topology.edges.length).fill(0),
    );
  });

  it("keeps pulse out of Delaunay and Crease edge state", () => {
    for (const preset of [breathingMembranePreset, crumpledPaperPreset]) {
      const result = preset.topologyBuilder.build(
        viewport,
        preset.createConfig(),
      );

      for (const edge of result.topology.edges) {
        expect(edge).not.toHaveProperty("pulse");
      }
    }
  });
});
