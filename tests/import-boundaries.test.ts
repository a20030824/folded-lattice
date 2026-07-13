import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const coreDirectory = join(process.cwd(), "src", "core");
const coreRenderDirectory = join(process.cwd(), "src", "core", "render");

function collectTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      files.push(...collectTypeScriptFiles(path));
      continue;
    }

    if (path.endsWith(".ts")) files.push(path);
  }

  return files;
}

function findViolationsInDirectories(
  directories: readonly string[],
  forbiddenFragments: readonly string[],
): string[] {
  const violations: string[] = [];

  for (const directory of directories) {
    for (const path of collectTypeScriptFiles(directory)) {
      const source = readFileSync(path, "utf8");

      if (forbiddenFragments.some((fragment) => source.includes(fragment))) {
        violations.push(relative(process.cwd(), path).replaceAll("\\", "/"));
      }
    }
  }

  return violations;
}

function findFilesUsingFragments(
  directory: string,
  forbiddenFragments: readonly string[],
): string[] {
  return findViolationsInDirectories([directory], forbiddenFragments).sort();
}

describe("import boundaries", () => {
  it("prevents core from importing wallpaper adapters", () => {
    expect(
      findViolationsInDirectories([coreDirectory], [
        "/wallpaper/",
        "../wallpaper",
        "../../wallpaper",
      ]),
    ).toEqual([]);
  });

  it("prevents core from importing Wandering Ink features", () => {
    expect(
      findViolationsInDirectories([coreDirectory], [
        "/features/wanderingInk/",
        "../features/wanderingInk",
        "../../features/wanderingInk",
        "../../../features/wanderingInk",
      ]),
    ).toEqual([]);
  });

  it("prevents core from importing membrane features", () => {
    expect(
      findViolationsInDirectories([coreDirectory], [
        "/features/membrane/",
        "../features/membrane",
        "../../features/membrane",
        "../../../features/membrane",
      ]),
    ).toEqual([]);
  });

  it("keeps crease implementation out of core topology and simulation", () => {
    const coreTopologyDirectory = join(
      process.cwd(),
      "src",
      "core",
      "topology",
    );
    const coreSimulationDirectory = join(
      process.cwd(),
      "src",
      "core",
      "simulation",
    );

    expect(
      findViolationsInDirectories(
        [coreTopologyDirectory, coreSimulationDirectory],
        [
          "/features/crease/",
          "../features/crease",
          "../../features/crease",
          "../../../features/crease",
        ],
      ),
    ).toEqual([]);
  });

  it("limits core render's crease dependency to Tide Archive", () => {
    expect(
      findFilesUsingFragments(coreRenderDirectory, [
        "/features/crease/",
        "../features/crease",
        "../../features/crease",
        "../../../features/crease",
      ]),
    ).toEqual(["src/core/render/contourRenderer.ts"]);

    expect(existsSync(join(coreRenderDirectory, "paperRenderer.ts"))).toBe(false);
    expect(existsSync(join(coreRenderDirectory, "webglPaperRenderer.ts"))).toBe(false);
    expect(
      existsSync(
        join(process.cwd(), "src", "features", "crumpledPaper", "paperRenderer.ts"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(
          process.cwd(),
          "src",
          "features",
          "crumpledPaper",
          "webglPaperRenderer.ts",
        ),
      ),
    ).toBe(true);
  });
});
