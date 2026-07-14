import { describe, expect, it, vi } from "vitest";
import type { PropertyBindingContext } from "../src/core/propertyBindings";
import { wanderingInkPreset } from "../src/presets/wanderingInk";

const context: PropertyBindingContext = {
  rebuildTopology: vi.fn(),
  scheduleTopologyRebuild: vi.fn(),
  refreshRenderer: vi.fn(),
};

describe("Wandering Ink properties", () => {
  it("scales triangle memory instead of the zero-valued edge baseline", () => {
    const config = wanderingInkPreset.createConfig();
    const memoryStrength = wanderingInkPreset
      .createPropertyBindings(config)
      .find((binding) => binding.name === "memoryStrength");
    expect(memoryStrength).toBeDefined();

    memoryStrength!.apply(0, context);
    expect(config.memory.enabled).toBe(false);
    expect(config.memory.triangleAccumulationRate).toBe(0);
    expect(config.memory.maximumMemory).toBe(0);

    memoryStrength!.apply(100, context);
    expect(config.memory.enabled).toBe(true);
    expect(config.memory.triangleAccumulationRate).toBeCloseTo(0.04);
    expect(config.memory.maximumMemory).toBeCloseTo(0.6);

    memoryStrength!.apply(200, context);
    expect(config.memory.enabled).toBe(true);
    expect(config.memory.triangleAccumulationRate).toBeCloseTo(0.08);
    expect(config.memory.maximumMemory).toBe(1);
  });
});
