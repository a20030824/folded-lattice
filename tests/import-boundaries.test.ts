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

describe("import boundaries", () => {
  it("prevents core from importing wallpaper adapters", () => {
    const violations: string[] = [];

    for (const path of collectTypeScriptFiles(coreDirectory)) {
      const source = readFileSync(path, "utf8");

      if (
        source.includes("/wallpaper/") ||
        source.includes("../wallpaper") ||
        source.includes("../../wallpaper")
      ) {
        violations.push(relative(process.cwd(), path));
      }
    }

    expect(violations).toEqual([]);
  });
});
