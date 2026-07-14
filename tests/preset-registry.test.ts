import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  livelyPresetNames,
  presetDefinitions,
  resolvePreset,
} from "../src/presets/registry";

interface LivelyPropertiesFile {
  preset: {
    items: string[];
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("preset registry", () => {
  it("keeps the Lively dropdown in the registry order", () => {
    const livelyProperties = JSON.parse(
      readFileSync(
        join(process.cwd(), "public", "LivelyProperties.json"),
        "utf8",
      ),
    ) as LivelyPropertiesFile;

    expect(livelyPresetNames).toEqual(
      presetDefinitions.map((definition) => definition.aliases[0]),
    );
    expect(livelyProperties.preset.items).toEqual(
      presetDefinitions.map((definition) => definition.displayName),
    );
  });

  it("normalizes aliases before resolving a preset", () => {
    expect(resolvePreset("  MeMbRaNe ").id).toBe("breathing-membrane");
    expect(resolvePreset(" CRUMPLED-PAPER ").id).toBe("crumpled-paper");
  });

  it("warns when an explicit unknown preset falls back to paper", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(resolvePreset("missing-preset").id).toBe("crumpled-paper");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Unknown preset "missing-preset"'),
    );
  });
});
