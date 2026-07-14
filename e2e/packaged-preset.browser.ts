import { expect, test } from "@playwright/test";

test("standalone package metadata locks the runtime preset", async ({ page }) => {
  await page.addInitScript(() => {
    const originalQuerySelector = Document.prototype.querySelector;
    Document.prototype.querySelector = function (selectors: string) {
      if (selectors === 'meta[name="folded-lattice-preset"]') {
        return { content: "wandering-ink" } as unknown as Element;
      }
      return originalQuerySelector.call(this, selectors);
    };
  });

  await page.goto("/?preset=paper");
  await page.waitForFunction(() => {
    const debugWindow = window as typeof window & {
      __engine?: { getState(): { time: { frame: number } } };
      __packagedPreset?: string | null;
      __presetId?: string;
    };
    return (
      debugWindow.__packagedPreset === "wandering-ink" &&
      debugWindow.__presetId === "wandering-ink" &&
      (debugWindow.__engine?.getState().time.frame ?? 0) >= 2
    );
  });

  await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __engine?: object;
      __packageEngineBefore?: object;
    };
    debugWindow.__packageEngineBefore = debugWindow.__engine;
    window.history.pushState({}, "", "?preset=membrane");
  });

  await page.waitForTimeout(100);
  const result = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __engine?: object;
      __packageEngineBefore?: object;
      __packagedPreset?: string | null;
      __presetId?: string;
    };
    return {
      packagedPreset: debugWindow.__packagedPreset,
      presetId: debugWindow.__presetId,
      sameEngine: debugWindow.__engine === debugWindow.__packageEngineBefore,
    };
  });

  expect(result).toEqual({
    packagedPreset: "wandering-ink",
    presetId: "wandering-ink",
    sameEngine: true,
  });
});
