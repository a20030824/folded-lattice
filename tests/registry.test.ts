import { describe, expect, it } from "vitest";
import { resolvePreset } from "../src/presets/registry";
import { creatureConfigKey } from "../src/features/wanderingInk/config";
import {
  legacyMemoryConfigKey,
  membraneWaveConfigKey,
  pulseConfigKey,
} from "../src/features/membrane/config";
import { contourConfigKey } from "../src/features/tideArchive/config";
import { creaseConfigKey } from "../src/features/crease/config";

describe("preset registry", () => {
  it.each([
    ["paper", "crumpled-paper"],
    ["crumpled-paper", "crumpled-paper"],
    ["ink", "wandering-ink"],
    ["wandering-ink", "wandering-ink"],
    ["membrane", "breathing-membrane"],
    ["breathing-membrane", "breathing-membrane"],
    ["tide", "tide-archive"],
    ["archive", "tide-archive"],
    ["tide-archive", "tide-archive"],
  ])("resolves %s to %s", (name, id) => {
    expect(resolvePreset(name).id).toBe(id);
  });

  it("keeps the current default for null and unknown names", () => {
    expect(resolvePreset(null).id).toBe("crumpled-paper");
    expect(resolvePreset("unknown").id).toBe("crumpled-paper");
  });
});

describe("preset config isolation", () => {
  it.each([
    "crumpled-paper",
    "wandering-ink",
    "breathing-membrane",
    "tide-archive",
  ])("creates independent shared and module config for %s", (name) => {
    const preset = resolvePreset(name);
    const first = preset.createConfig();
    const second = preset.createConfig();

    expect(first).not.toBe(second);
    expect(first.modules).not.toBe(second.modules);
    first.topology.nodeCount += 1;
    first.fields.pressure.count += 1;
    expect(second.topology.nodeCount).not.toBe(first.topology.nodeCount);
    expect(second.fields.pressure.count).not.toBe(first.fields.pressure.count);
  });

  it("isolates feature module configs and leaves unrelated presets empty", () => {
    const inkA = resolvePreset("ink").createConfig();
    const inkB = resolvePreset("ink").createConfig();
    expect(inkA.modules.require(creatureConfigKey)).not.toBe(
      inkB.modules.require(creatureConfigKey),
    );

    const membrane = resolvePreset("membrane").createConfig();
    expect(membrane.modules.get(pulseConfigKey)).toBeDefined();
    expect(membrane.modules.get(membraneWaveConfigKey)).toBeDefined();
    expect(membrane.modules.get(legacyMemoryConfigKey)).toBeDefined();

    const tide = resolvePreset("tide").createConfig();
    expect(tide.modules.get(contourConfigKey)).toBeDefined();
    expect(tide.modules.get(creaseConfigKey)).toBeDefined();
    expect(resolvePreset("paper").createConfig().modules.get(contourConfigKey)).toBeUndefined();
    expect(resolvePreset("ink").createConfig().modules.get(creaseConfigKey)).toBeUndefined();
  });
});
