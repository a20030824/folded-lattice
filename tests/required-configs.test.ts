import { describe, expect, it } from "vitest";
import { ModuleConfigStore } from "../src/core/moduleConfig";
import { createEmptySimulationState } from "../src/core/state";
import { creaseConfigKey } from "../src/features/crease/config";
import { creaseLifeSystem } from "../src/features/crease/creaseLife";
import { creaseTopologyBuilder } from "../src/features/crease/creaseTopology";
import { pulseConfigKey } from "../src/features/membrane/config";
import { breathingMembranePreset } from "../src/presets/breathingMembrane";
import { crumpledPaperPreset } from "../src/presets/crumpledPaper";
import { tideArchivePreset } from "../src/presets/tideArchive";

const viewport = { width: 320, height: 240, devicePixelRatio: 1 };

describe("required module configurations", () => {
  it("keeps membrane pulse color in the pulse feature config", () => {
    const config = breathingMembranePreset.createConfig();
    const pulse = config.modules.require(pulseConfigKey);

    expect(pulse.color).toBe("#f0ddb4");
    expect(config.render.colors).not.toHaveProperty("pulse");
  });

  it("registers crease config for every crease preset", () => {
    for (const preset of [crumpledPaperPreset, tideArchivePreset]) {
      const config = preset.createConfig();
      expect(config.modules.get(creaseConfigKey)).toBeDefined();
    }
  });

  it("fails fast when crease topology config is missing", () => {
    const config = crumpledPaperPreset.createConfig();
    config.modules = new ModuleConfigStore();

    expect(() => {
      creaseTopologyBuilder.build(viewport, config);
    }).toThrow('Module config "crease-config" is not available.');
  });

  it("fails fast when crease lifecycle config is missing", () => {
    const config = crumpledPaperPreset.createConfig();
    const result = creaseTopologyBuilder.build(viewport, config);
    const state = createEmptySimulationState(viewport);

    state.topology = result.topology;
    result.initializeResources?.(state.resources);
    config.modules = new ModuleConfigStore();

    expect(() => {
      creaseLifeSystem.update(state, config, 1 / 60);
    }).toThrow('Module config "crease-config" is not available.');
  });

  it("allows crease life to be omitted", () => {
    const config = crumpledPaperPreset.createConfig();
    const settings = config.modules.require(creaseConfigKey);
    const { life: _life, ...withoutLife } = settings;
    config.modules.set(creaseConfigKey, withoutLife);
    const result = creaseTopologyBuilder.build(viewport, config);
    const state = createEmptySimulationState(viewport);

    state.topology = result.topology;
    result.initializeResources?.(state.resources);

    expect(() => {
      creaseLifeSystem.update(state, config, 1 / 60);
    }).not.toThrow();
  });

  it("allows crease life to be disabled", () => {
    const config = crumpledPaperPreset.createConfig();
    const settings = config.modules.require(creaseConfigKey);
    const life = settings.life;
    expect(life).toBeDefined();
    config.modules.set(creaseConfigKey, {
      ...settings,
      life: { ...life!, enabled: false },
    });
    const result = creaseTopologyBuilder.build(viewport, config);
    const state = createEmptySimulationState(viewport);

    state.topology = result.topology;
    result.initializeResources?.(state.resources);

    expect(() => {
      creaseLifeSystem.update(state, config, 1 / 60);
    }).not.toThrow();
  });
});
