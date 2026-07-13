import { describe, expect, it } from "vitest";
import { ResourceStore } from "../src/core/resources";
import { createEmptySimulationState } from "../src/core/state";
import {
  membraneLegacyRuntimeKey,
  membranePulseRuntimeKey,
} from "../src/features/membrane/state";
import { legacyMemorySystem } from "../src/features/membrane/updateLegacy";
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
    const legacy = resources.require(membraneLegacyRuntimeKey);
    expect(runtime.topology).toBe(result.topology);
    expect(runtime.edgePulse).toHaveLength(result.topology.edges.length);
    expect(Array.from(runtime.edgePulse)).toEqual(
      new Array(result.topology.edges.length).fill(0),
    );
    expect(legacy.topology).toBe(result.topology);
    expect(legacy.triangleLegacy).toBeInstanceOf(Float32Array);
    expect(legacy.diffusionScratch).toBeInstanceOf(Float32Array);
    expect(legacy.triangleLegacy).toHaveLength(result.topology.triangles.length);
    expect(legacy.diffusionScratch).toHaveLength(result.topology.triangles.length);
    expect(Array.from(legacy.triangleLegacy)).toEqual(
      new Array(result.topology.triangles.length).fill(0),
    );
  });

  it("replaces the pulse runtime when topology is rebuilt", () => {
    const config = breathingMembranePreset.createConfig();
    const state = createEmptySimulationState(viewport);
    const first = breathingMembranePreset.topologyBuilder.build(viewport, config);

    state.topology = first.topology;
    first.initializeResources?.(state.resources);
    const oldRuntime = state.resources.require(membranePulseRuntimeKey);
    const oldLegacy = state.resources.require(membraneLegacyRuntimeKey);
    oldRuntime.edgePulse[0] = 1;
    oldLegacy.triangleLegacy[0] = 0.25;
    oldLegacy.diffusionScratch[0] = 0.25;

    config.topology.nodeCount -= 20;
    const second = breathingMembranePreset.topologyBuilder.build(viewport, config);
    state.topology = second.topology;
    second.initializeResources?.(state.resources);

    const newRuntime = state.resources.require(membranePulseRuntimeKey);
    const newLegacy = state.resources.require(membraneLegacyRuntimeKey);
    expect(newRuntime).not.toBe(oldRuntime);
    expect(newLegacy).not.toBe(oldLegacy);
    expect(newRuntime.topology).toBe(second.topology);
    expect(newLegacy.topology).toBe(second.topology);
    expect(newRuntime.edgePulse).toHaveLength(second.topology.edges.length);
    expect(Array.from(newRuntime.edgePulse)).toEqual(
      new Array(second.topology.edges.length).fill(0),
    );
    expect(newLegacy.triangleLegacy).toHaveLength(second.topology.triangles.length);
    expect(newLegacy.diffusionScratch).toHaveLength(second.topology.triangles.length);
    expect(Array.from(newLegacy.triangleLegacy)).toEqual(
      new Array(second.topology.triangles.length).fill(0),
    );
  });

  it("writes legacy activity to the resource instead of triangles", () => {
    const config = breathingMembranePreset.createConfig();
    const state = createEmptySimulationState(viewport);
    const result = breathingMembranePreset.topologyBuilder.build(viewport, config);

    state.topology = result.topology;
    result.initializeResources?.(state.resources);
    state.resources.require(membranePulseRuntimeKey).edgePulse.fill(1);

    legacyMemorySystem.update(state, config, 1 / 60);

    const legacy = state.resources.require(membraneLegacyRuntimeKey);
    expect(Array.from(legacy.triangleLegacy).some((value) => value > 0)).toBe(true);
    for (const triangle of state.topology.triangles) {
      expect(triangle).not.toHaveProperty("legacy");
    }
  });

  it("keeps pulse and legacy out of Delaunay and Crease state", () => {
    for (const preset of [breathingMembranePreset, crumpledPaperPreset]) {
      const result = preset.topologyBuilder.build(
        viewport,
        preset.createConfig(),
      );

      for (const edge of result.topology.edges) {
        expect(edge).not.toHaveProperty("pulse");
      }
      for (const triangle of result.topology.triangles) {
        expect(triangle).not.toHaveProperty("legacy");
      }
    }
  });
});
