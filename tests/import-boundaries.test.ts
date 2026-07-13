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

function extractModuleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:from\s*|import\s*\()\s*["']([^"']+)["']/g;

  for (const match of source.matchAll(pattern)) {
    const specifier = match[1];
    if (specifier) specifiers.push(specifier);
  }

  return specifiers;
}

function findViolationsInDirectories(
  directories: readonly string[],
  forbiddenFragments: readonly string[],
): string[] {
  const violations: string[] = [];

  for (const directory of directories) {
    for (const path of collectTypeScriptFiles(directory)) {
      const source = readFileSync(path, "utf8");

      if (
        extractModuleSpecifiers(source).some((specifier) =>
          forbiddenFragments.some((fragment) => specifier.includes(fragment)),
        )
      ) {
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

  it("prevents core from importing feature implementations", () => {
    expect(
      findViolationsInDirectories([coreDirectory], [
        "/features/",
        "../features",
        "../../features",
        "../../../features",
        "../../../../features",
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

  it("prevents core render from importing crease features", () => {
    expect(
      findFilesUsingFragments(coreRenderDirectory, [
        "/features/crease/",
        "../features/crease",
        "../../features/crease",
        "../../../features/crease",
      ]),
    ).toEqual([]);

    expect(existsSync(join(coreRenderDirectory, "paperRenderer.ts"))).toBe(false);
    expect(existsSync(join(coreRenderDirectory, "webglPaperRenderer.ts"))).toBe(false);
    expect(existsSync(join(coreRenderDirectory, "contourRenderer.ts"))).toBe(false);
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
    expect(
      existsSync(
        join(
          process.cwd(),
          "src",
          "features",
          "tideArchive",
          "contourRenderer.ts",
        ),
      ),
    ).toBe(true);
  });

  it("keeps membrane renderers and shaders out of core", () => {
    const membraneDirectory = join(
      process.cwd(),
      "src",
      "features",
      "membrane",
    );

    expect(existsSync(join(coreRenderDirectory, "canvasRenderer.ts"))).toBe(false);
    expect(
      existsSync(join(coreRenderDirectory, "webglMembraneRenderer.ts")),
    ).toBe(false);
    expect(
      existsSync(
        join(coreRenderDirectory, "shaders", "membrane.vert.glsl"),
      ),
    ).toBe(false);
    expect(
      existsSync(
        join(coreRenderDirectory, "shaders", "membrane.frag.glsl"),
      ),
    ).toBe(false);

    expect(existsSync(join(membraneDirectory, "canvasRenderer.ts"))).toBe(true);
    expect(
      existsSync(join(membraneDirectory, "webglMembraneRenderer.ts")),
    ).toBe(true);
    expect(
      existsSync(
        join(membraneDirectory, "shaders", "membrane.vert.glsl"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(membraneDirectory, "shaders", "membrane.frag.glsl"),
      ),
    ).toBe(true);
  });

  it("keeps membrane pulse state out of core edges", () => {
    const coreStateSource = readFileSync(
      join(process.cwd(), "src", "core", "state.ts"),
      "utf8",
    );

    expect(coreStateSource).not.toMatch(/\bpulse\s*:\s*number\b/);
  });

  it("keeps membrane legacy state out of core", () => {
    const coreStateSource = readFileSync(
      join(process.cwd(), "src", "core", "state.ts"),
      "utf8",
    );

    expect(coreStateSource).not.toMatch(/\blegacy\s*:\s*number\b/);
    expect(coreStateSource).not.toContain("legacyScratch");
  });
});
