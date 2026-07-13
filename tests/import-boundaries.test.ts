import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const coreDirectory = join(process.cwd(), "src", "core");

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

function findCoreViolations(
  forbiddenFragments: readonly string[],
): string[] {
  const violations: string[] = [];

  for (const path of collectTypeScriptFiles(coreDirectory)) {
    const source = readFileSync(path, "utf8");

    if (forbiddenFragments.some((fragment) => source.includes(fragment))) {
      violations.push(relative(process.cwd(), path));
    }
  }

  return violations;
}

describe("import boundaries", () => {
  it("prevents core from importing wallpaper adapters", () => {
    expect(
      findCoreViolations([
        "/wallpaper/",
        "../wallpaper",
        "../../wallpaper",
      ]),
    ).toEqual([]);
  });

  it("prevents core from importing Wandering Ink features", () => {
    expect(
      findCoreViolations([
        "/features/wanderingInk/",
        "../features/wanderingInk",
        "../../features/wanderingInk",
        "../../../features/wanderingInk",
      ]),
    ).toEqual([]);
  });

  it("prevents core from importing membrane features", () => {
    expect(
      findCoreViolations([
        "/features/membrane/",
        "../features/membrane",
        "../../features/membrane",
        "../../../features/membrane",
      ]),
    ).toEqual([]);
  });
});
