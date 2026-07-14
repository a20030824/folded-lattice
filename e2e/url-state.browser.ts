import { expect, test, type Page } from "@playwright/test";

interface CreatureSnapshot {
  baseSpeedRatio: number;
  trailCount: number;
}

async function waitForRuntime(
  page: Page,
  presetId: string,
  mode: string | null,
): Promise<void> {
  await page.waitForFunction(
    ({ expectedMode, expectedPresetId }) => {
      const debugWindow = window as typeof window & {
        __engine?: { getState(): { time: { frame: number } } };
        __mode?: string | null;
        __presetId?: string;
      };
      return (
        debugWindow.__presetId === expectedPresetId &&
        debugWindow.__mode === expectedMode &&
        (debugWindow.__engine?.getState().time.frame ?? 0) >= 2
      );
    },
    { expectedMode: mode, expectedPresetId: presetId },
  );
}

function readCreatureConfig(): CreatureSnapshot | null {
  const debugWindow = window as typeof window & {
    __config?: {
      modules: unknown;
    };
  };
  const store = debugWindow.__config?.modules as
    | { values?: Map<symbol, unknown> }
    | undefined;
  if (!store?.values) return null;

  for (const [key, value] of store.values) {
    if (key.description !== "wandering-ink-creature") continue;
    const creature = value as CreatureSnapshot;
    return {
      baseSpeedRatio: creature.baseSpeedRatio,
      trailCount: creature.trailCount,
    };
  }
  return null;
}

test("History API changes atomically reapply preset and mode state", async ({
  page,
}) => {
  await page.goto("/?preset=ink");
  await waitForRuntime(page, "wandering-ink", null);

  const before = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __config?: {
        performance: { maximumDevicePixelRatio: number };
        render: { colors: { background: string } };
      };
      __engine?: { getState(): { time: { frame: number } } };
      __urlOldEngine?: { getState(): { time: { frame: number } } };
    };

    window.livelyPropertyListener?.("brightness", 130);
    window.livelyPropertyListener?.("quality", 2);
    debugWindow.__urlOldEngine = debugWindow.__engine;
    const oldFrame = debugWindow.__urlOldEngine?.getState().time.frame ?? -1;
    window.history.pushState({}, "", "?preset=ink&mode=serpent");

    return {
      background: debugWindow.__config?.render.colors.background,
      maximumDevicePixelRatio:
        debugWindow.__config?.performance.maximumDevicePixelRatio,
      oldFrame,
    };
  });

  await waitForRuntime(page, "wandering-ink", "serpent");

  const serpent = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __config?: {
        performance: { maximumDevicePixelRatio: number };
        render: { colors: { background: string } };
      };
    };
    return {
      background: debugWindow.__config?.render.colors.background,
      creature: readCreatureConfig(),
      maximumDevicePixelRatio:
        debugWindow.__config?.performance.maximumDevicePixelRatio,
    };
  });

  expect(serpent).toEqual({
    background: before.background,
    creature: { baseSpeedRatio: 0.068, trailCount: 340 },
    maximumDevicePixelRatio: before.maximumDevicePixelRatio,
  });

  await page.waitForTimeout(100);
  const stoppedOldFrame = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __urlOldEngine?: { getState(): { time: { frame: number } } };
    };
    return debugWindow.__urlOldEngine?.getState().time.frame ?? -1;
  });
  expect(stoppedOldFrame).toBe(before.oldFrame);

  await page.evaluate(() => {
    window.history.replaceState({}, "", "?preset=ink&mode=hatchling");
  });
  await waitForRuntime(page, "wandering-ink", "hatchling");
  expect(await page.evaluate(readCreatureConfig)).toEqual({
    baseSpeedRatio: 0.125,
    trailCount: 70,
  });

  await page.evaluate(() => {
    window.history.pushState({}, "", "?preset=membrane");
  });
  await waitForRuntime(page, "breathing-membrane", null);

  await page.goBack();
  await waitForRuntime(page, "wandering-ink", "hatchling");
  expect(await page.evaluate(readCreatureConfig)).toEqual({
    baseSpeedRatio: 0.125,
    trailCount: 70,
  });
});

test("mode changes do not restart presets without mode support", async ({ page }) => {
  await page.goto("/?preset=paper");
  await waitForRuntime(page, "crumpled-paper", null);

  const sameEngine = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __engine?: object;
    };
    const engine = debugWindow.__engine;
    window.history.pushState({}, "", "?preset=paper&mode=serpent");
    return debugWindow.__engine === engine;
  });

  expect(sameEngine).toBe(true);
  await waitForRuntime(page, "crumpled-paper", null);
});
