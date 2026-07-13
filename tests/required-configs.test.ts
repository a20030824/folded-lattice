import { describe, expect, it } from "vitest";
import { ModuleConfigStore } from "../src/core/moduleConfig";
import { createEmptySimulationState } from "../src/core/state";
import { creaseConfigKey } from "../src/features/crease/config";
import { creaseLifeSystem } from "../src/features/crease/creaseLife";
import { creaseTopologyBuilder } from "../src/features/crease/creaseTopology";
import {
  legacyMemoryConfigKey,
  membraneWaveConfigKey,
  pulseConfigKey,
} from "../src/features/membrane/config";
import { membranePulseSystem } from "../src/features/membrane/membranePulse";
import { membraneWaveSystem } from "../src/features/membrane/membraneWave";
import {
  requireMembraneLegacyRuntime,
  requireMembranePulseRuntime,
} from "../src/features/membrane/state";
import { legacyMemorySystem } from "../src/features/membrane/updateLegacy";
import { inkWickSystem } from "../src/features/wanderingInk/inkWick";
import { creatureConfigKey } from "../src/features/wanderingInk/config";
import { inkRuntimeKey } from "../src/features/wanderingInk/state";
import { wandererSystem } from "../src/features/wanderingInk/wanderer";
import { breathingMembranePreset } from "../src/presets/breathingMembrane";
import { crumpledPaperPreset } from "../src/presets/crumpledPaper";
import { tideArchivePreset } from "../src/presets/tideArchive";
import { wanderingInkPreset } from "../src/presets/wanderingInk";

const viewport = { width: 320, height: 240, devicePixelRatio: 1 };

function createMembraneState() {
  const config = breathingMembranePreset.createConfig();
  const result = breathingMembranePreset.topologyBuilder.build(viewport, config);
  const state = createEmptySimulationState(viewport);

  state.topology = result.topology;
  result.initializeResources?.(state.resources);

  return { config, state };
}

describe("required module configurations", () => {
  it("keeps Wandering Ink color in the creature feature config", () => {
    const config = wanderingInkPreset.createConfig();
    const creature = config.modules.require(creatureConfigKey);

    expect(creature.color).toBe("#34425c");
    expect(config.render.colors).not.toHaveProperty("ink");
  });

  it("keeps membrane pulse color in the pulse feature config", () => {
    const config = breathingMembranePreset.createConfig();
    const pulse = config.modules.require(pulseConfigKey);

    expect(pulse.color).toBe("#f0ddb4");
    expect(config.render.colors).not.toHaveProperty("pulse");
  });

  it("registers every required Membrane config", () => {
    const config = breathingMembranePreset.createConfig();

    expect(config.modules.get(pulseConfigKey)).toBeDefined();
    expect(config.modules.get(membraneWaveConfigKey)).toBeDefined();
    expect(config.modules.get(legacyMemoryConfigKey)).toBeDefined();
  });

  it("fails fast when the membrane wave config is missing", () => {
    const config = breathingMembranePreset.createConfig();
    const state = createEmptySimulationState(viewport);
    config.modules = new ModuleConfigStore();

    expect(() => {
      membraneWaveSystem.update(state, config, 1 / 60);
    }).toThrow('Module config "breathing-membrane-wave" is not available.');
  });

  it("fails fast when the membrane pulse config is missing", () => {
    const config = breathingMembranePreset.createConfig();
    const state = createEmptySimulationState(viewport);
    config.modules = new ModuleConfigStore();

    expect(() => {
      membranePulseSystem.update(state, config, 1 / 60);
    }).toThrow('Module config "breathing-membrane-pulse" is not available.');
  });

  it("fails fast when the membrane legacy config is missing", () => {
    const config = breathingMembranePreset.createConfig();
    const state = createEmptySimulationState(viewport);
    config.modules = new ModuleConfigStore();

    expect(() => {
      legacyMemorySystem.update(state, config, 1 / 60);
    }).toThrow(
      'Module config "breathing-membrane-legacy-memory" is not available.',
    );
  });

  it("allows Membrane feature systems to be disabled", () => {
    const { config, state } = createMembraneState();
    const pulseSettings = config.modules.require(pulseConfigKey);
    const waveSettings = config.modules.require(membraneWaveConfigKey);
    const legacySettings = config.modules.require(legacyMemoryConfigKey);

    config.modules.set(pulseConfigKey, { ...pulseSettings, enabled: false });
    config.modules.set(membraneWaveConfigKey, { ...waveSettings, enabled: false });
    config.modules.set(legacyMemoryConfigKey, { ...legacySettings, enabled: false });

    const pulseRuntime = requireMembranePulseRuntime(state);
    const legacyRuntime = requireMembraneLegacyRuntime(state);
    pulseRuntime.edgePulse[0] = 0.75;
    legacyRuntime.triangleLegacy[0] = 0.2;
    legacyRuntime.diffusionScratch[0] = 0.1;
    state.pointer.isInside = true;
    state.pointer.isDown = true;

    const forcesBefore = state.topology.nodes.map((node) => ({
      x: node.force.x,
      y: node.force.y,
      z: node.force.z,
    }));
    const pulseBefore = Array.from(pulseRuntime.edgePulse);
    const legacyBefore = Array.from(legacyRuntime.triangleLegacy);
    const scratchBefore = Array.from(legacyRuntime.diffusionScratch);

    expect(() => {
      membraneWaveSystem.update(state, config, 1 / 60);
      membranePulseSystem.update(state, config, 1 / 60);
      legacyMemorySystem.update(state, config, 1 / 60);
    }).not.toThrow();

    expect(state.topology.nodes.map((node) => ({
      x: node.force.x,
      y: node.force.y,
      z: node.force.z,
    }))).toEqual(forcesBefore);
    expect(Array.from(pulseRuntime.edgePulse)).toEqual(pulseBefore);
    expect(Array.from(legacyRuntime.triangleLegacy)).toEqual(legacyBefore);
    expect(Array.from(legacyRuntime.diffusionScratch)).toEqual(scratchBefore);
  });

  it("fails fast when the wanderer config is missing", () => {
    const config = wanderingInkPreset.createConfig();
    const state = createEmptySimulationState(viewport);
    config.modules = new ModuleConfigStore();

    expect(() => {
      wandererSystem.update(state, config, 1 / 60);
    }).toThrow('Module config "wandering-ink-creature" is not available.');
  });

  it("fails fast when the ink wick config is missing", () => {
    const config = wanderingInkPreset.createConfig();
    const state = createEmptySimulationState(viewport);
    config.modules = new ModuleConfigStore();

    expect(() => {
      inkWickSystem.update(state, config, 1 / 60);
    }).toThrow('Module config "wandering-ink-creature" is not available.');
  });

  it("fails fast when Wandering Ink mode config is missing", () => {
    const config = wanderingInkPreset.createConfig();
    config.modules = new ModuleConfigStore();

    expect(() => {
      wanderingInkPreset.applyMode?.(config, "serpent");
    }).toThrow('Module config "wandering-ink-creature" is not available.');
  });

  it("allows Wandering Ink systems to be disabled", () => {
    const config = wanderingInkPreset.createConfig();
    const settings = config.modules.require(creatureConfigKey);
    config.modules.set(creatureConfigKey, { ...settings, enabled: false });
    const state = createEmptySimulationState(viewport);

    expect(() => {
      wandererSystem.update(state, config, 1 / 60);
      inkWickSystem.update(state, config, 1 / 60);
    }).not.toThrow();
    expect(state.resources.get(inkRuntimeKey)).toBeUndefined();
  });

  it("allows unknown Wandering Ink modes to be ignored", () => {
    const config = wanderingInkPreset.createConfig();
    const before = { ...config.modules.require(creatureConfigKey) };

    expect(() => {
      wanderingInkPreset.applyMode?.(config, "unknown-mode");
    }).not.toThrow();
    expect(config.modules.require(creatureConfigKey)).toEqual(before);
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
