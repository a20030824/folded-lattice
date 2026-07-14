import { describe, expect, it, vi } from "vitest";
import {
  constrainPresetToPackage,
  packagedPresetMetaName,
  readPackagedPreset,
} from "../src/app/packagePreset";

function createDocument(content?: string): Pick<Document, "querySelector"> {
  return {
    querySelector: vi.fn(() =>
      content === undefined ? null : ({ content } as HTMLMetaElement),
    ),
  } as unknown as Pick<Document, "querySelector">;
}

describe("packaged preset metadata", () => {
  it("reads and normalizes the fixed preset meta value", () => {
    const documentRoot = createDocument("  wandering-ink  ");

    expect(readPackagedPreset(documentRoot)).toBe("wandering-ink");
    expect(documentRoot.querySelector).toHaveBeenCalledWith(
      `meta[name="${packagedPresetMetaName}"]`,
    );
  });

  it("returns null when the web demo has no package marker", () => {
    expect(readPackagedPreset(createDocument())).toBeNull();
    expect(readPackagedPreset(createDocument("   "))).toBeNull();
  });

  it("keeps URL state unchanged for the web demo", () => {
    const state = { preset: "wandering-ink", mode: "serpent" };
    expect(constrainPresetToPackage(state, null)).toBe(state);
  });

  it("overrides URL preset while preserving mode in a package", () => {
    expect(
      constrainPresetToPackage(
        { preset: "breathing-membrane", mode: "hatchling" },
        "crumpled-paper",
      ),
    ).toEqual({ preset: "crumpled-paper", mode: "hatchling" });
  });
});
