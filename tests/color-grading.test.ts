import { describe, expect, it, vi } from "vitest";
import type { FoldedLatticeConfig } from "../src/core/config";
import { parseColor } from "../src/core/math";
import type {
  PropertyBinding,
  PropertyBindingContext,
} from "../src/core/propertyBindings";
import { creaseConfigKey } from "../src/features/crease/config";
import { pulseConfigKey } from "../src/features/membrane/config";
import { contourConfigKey } from "../src/features/tideArchive/config";
import { creatureConfigKey } from "../src/features/wanderingInk/config";
import { resolvePreset } from "../src/presets/registry";
import {
  createPresetColorGradingBindings,
  gradeHexColor,
} from "../src/wallpaper/colorGrading";

function requireBinding(
  bindings: readonly PropertyBinding[],
  name: string,
): PropertyBinding {
  const binding = bindings.find((candidate) => candidate.name === name);
  if (!binding) throw new Error(`Binding "${name}" was not found.`);
  return binding;
}

function createContext(): PropertyBindingContext & {
  rebuildTopology: ReturnType<typeof vi.fn>;
  scheduleTopologyRebuild: ReturnType<typeof vi.fn>;
  refreshRenderer: ReturnType<typeof vi.fn>;
} {
  return {
    rebuildTopology: vi.fn(),
    scheduleTopologyRebuild: vi.fn(),
    refreshRenderer: vi.fn(),
  };
}

describe("wallpaper color grading", () => {
  it("keeps neutral grading unchanged and clamps control ranges", () => {
    expect(
      gradeHexColor("#7f91a3", {
        brightness: 100,
        temperature: 0,
        tint: 0,
      }),
    ).toBe("#7f91a3");

    expect(
      gradeHexColor("#7f91a3", {
        brightness: 500,
        temperature: 500,
        tint: -500,
      }),
    ).toBe(
      gradeHexColor("#7f91a3", {
        brightness: 150,
        temperature: 100,
        tint: -100,
      }),
    );
  });

  it("moves temperature between red and blue and tint between magenta and green", () => {
    const warm = parseColor(
      gradeHexColor("#808080", {
        brightness: 100,
        temperature: 100,
        tint: 0,
      }),
    );
    const cool = parseColor(
      gradeHexColor("#808080", {
        brightness: 100,
        temperature: -100,
        tint: 0,
      }),
    );
    const magenta = parseColor(
      gradeHexColor("#808080", {
        brightness: 100,
        temperature: 0,
        tint: 100,
      }),
    );
    const green = parseColor(
      gradeHexColor("#808080", {
        brightness: 100,
        temperature: 0,
        tint: -100,
      }),
    );

    expect(warm.r).toBeGreaterThan(cool.r);
    expect(warm.b).toBeLessThan(cool.b);
    expect(magenta.r + magenta.b).toBeGreaterThan(green.r + green.b);
    expect(magenta.g).toBeLessThan(green.g);
  });

  it("always recalculates from the immutable original palette", () => {
    const config = resolvePreset("paper").createConfig();
    const original = config.render.colors.background;
    const bindings = createPresetColorGradingBindings("crumpled-paper", config);
    const context = createContext();

    requireBinding(bindings, "brightness").apply(150, context);
    requireBinding(bindings, "temperature").apply(70, context);
    expect(config.render.colors.background).toBe(
      gradeHexColor(original, {
        brightness: 150,
        temperature: 70,
        tint: 0,
      }),
    );

    requireBinding(bindings, "brightness").apply(100, context);
    requireBinding(bindings, "temperature").apply(0, context);
    expect(config.render.colors.background).toBe(original);
    expect(context.rebuildTopology).not.toHaveBeenCalled();
    expect(context.scheduleTopologyRebuild).not.toHaveBeenCalled();
    expect(context.refreshRenderer).not.toHaveBeenCalled();
  });

  it("grades feature-owned colors for every preset", () => {
    const cases: Array<{
      alias: string;
      presetId: string;
      getFeatureColor(config: FoldedLatticeConfig): string;
    }> = [
      {
        alias: "paper",
        presetId: "crumpled-paper",
        getFeatureColor: (config) =>
          config.modules.require(creaseConfigKey).paperLit,
      },
      {
        alias: "ink",
        presetId: "wandering-ink",
        getFeatureColor: (config) =>
          config.modules.require(creatureConfigKey).color,
      },
      {
        alias: "membrane",
        presetId: "breathing-membrane",
        getFeatureColor: (config) =>
          config.modules.require(pulseConfigKey).color,
      },
      {
        alias: "tide",
        presetId: "tide-archive",
        getFeatureColor: (config) =>
          config.modules.require(contourConfigKey).presentColor,
      },
    ];

    for (const testCase of cases) {
      const config = resolvePreset(testCase.alias).createConfig();
      const original = testCase.getFeatureColor(config);
      const bindings = createPresetColorGradingBindings(
        testCase.presetId,
        config,
      );
      const context = createContext();

      expect(bindings.map((binding) => binding.name)).toEqual([
        "brightness",
        "temperature",
        "tint",
      ]);

      requireBinding(bindings, "temperature").apply(100, context);
      expect(testCase.getFeatureColor(config)).not.toBe(original);
      requireBinding(bindings, "temperature").apply(0, context);
      expect(testCase.getFeatureColor(config)).toBe(original);
    }
  });
});
