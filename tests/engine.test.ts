import { describe, expect, it } from "vitest";
import { createEngine } from "../src/core/createEngine";
import { resolvePreset } from "../src/presets/registry";
import type { Renderer } from "../src/core/contracts";

const viewport = { width: 320, height: 240, devicePixelRatio: 1 };
const renderer: Renderer = {
  resize() {},
  render() {},
  dispose() {},
};

describe("engine tick smoke test", () => {
  it.each([
    "crumpled-paper",
    "wandering-ink",
    "breathing-membrane",
    "tide-archive",
  ])("ticks without NaN for %s", (name) => {
    const preset = resolvePreset(name);
    const config = preset.createConfig();
    const engine = createEngine(preset, config, renderer, viewport);
    const state = engine.getState();

    for (let step = 0; step < 3; step += 1) {
      for (const system of preset.simulationSystems) {
        system.update(state, config, 1 / 60);
      }
      for (const system of preset.frameSystems) {
        system.updateFrame(state, config, 1 / 60);
      }
    }

    for (const node of state.topology.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
      expect(Number.isFinite(node.position.z)).toBe(true);
      expect(Number.isFinite(node.velocity.x)).toBe(true);
      expect(Number.isFinite(node.velocity.y)).toBe(true);
      expect(Number.isFinite(node.velocity.z)).toBe(true);
      expect(Number.isFinite(node.force.x)).toBe(true);
      expect(Number.isFinite(node.force.y)).toBe(true);
      expect(Number.isFinite(node.force.z)).toBe(true);
    }

    engine.resize({ width: 400, height: 260, devicePixelRatio: 1 });
    engine.rebuildTopology();
    engine.dispose();
  });
});
