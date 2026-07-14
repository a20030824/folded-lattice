import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { presetDefinitions } from "../src/presets/registry";

interface PackageDefinition {
  slug: string;
  preset: string;
  title: string;
  description: string;
  tags: string[];
  properties: string[];
}

interface PackageManifest {
  version: number;
  author: string;
  contact: string;
  packages: PackageDefinition[];
}

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), "lively-packages", "manifest.json"), "utf8"),
) as PackageManifest;
const sharedProperties = JSON.parse(
  readFileSync(join(process.cwd(), "public", "LivelyProperties.json"), "utf8"),
) as Record<string, unknown>;
const packageMetadata = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
) as { license?: string };
const licenseText = readFileSync(join(process.cwd(), "LICENSE"), "utf8");

describe("Lively package manifest", () => {
  it("defines exactly one standalone package for every preset", () => {
    expect(manifest.packages).toHaveLength(4);
    expect(new Set(manifest.packages.map((entry) => entry.slug)).size).toBe(4);
    expect(new Set(manifest.packages.map((entry) => entry.preset))).toEqual(
      new Set(presetDefinitions.map((definition) => definition.id)),
    );
  });

  it("uses complete metadata for every library item", () => {
    expect(manifest.version).toBeGreaterThan(0);
    expect(manifest.author.trim()).not.toBe("");
    expect(manifest.contact).toMatch(/^https:\/\//);

    for (const entry of manifest.packages) {
      expect(entry.title).toMatch(/^Folded Lattice — /);
      expect(entry.description.trim()).not.toBe("");
      expect(entry.tags.length).toBeGreaterThan(0);
    }
  });

  it("declares and ships the MIT license source", () => {
    expect(packageMetadata.license).toBe("MIT");
    expect(licenseText).toMatch(/^MIT License\n/);
    expect(licenseText).toContain("Copyright (c) 2026 a20030824");
    expect(licenseText).toContain(
      "The above copyright notice and this permission notice shall be included",
    );
  });

  it("only exposes controls supported by each standalone preset", () => {
    const sharedControls = [
      "brightness",
      "temperature",
      "tint",
      "quality",
      "targetFps",
    ];

    for (const entry of manifest.packages) {
      expect(entry.properties).not.toContain("preset");
      expect(new Set(entry.properties).size).toBe(entry.properties.length);
      expect(entry.properties).toEqual(expect.arrayContaining(sharedControls));
      for (const propertyName of entry.properties) {
        expect(sharedProperties).toHaveProperty(propertyName);
      }
    }
  });
});
