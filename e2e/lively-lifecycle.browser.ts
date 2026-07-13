import { expect, test, type Page } from "@playwright/test";

async function waitForRuntime(
  page: Page,
  expectedPresetId: string,
): Promise<void> {
  await page.waitForFunction(
    (presetId) => {
      const debugWindow = window as typeof window & {
        __presetId?: string;
        __engine?: {
          getState(): { time: { frame: number } };
        };
      };
      return (
        debugWindow.__presetId === presetId &&
        (debugWindow.__engine?.getState().time.frame ?? 0) >= 2
      );
    },
    expectedPresetId,
  );
}

test("Lively quality refresh preserves topology", async ({ page }) => {
  await page.goto("/?preset=membrane");
  await waitForRuntime(page, "breathing-membrane");

  const result = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __config?: {
        performance: { maximumDevicePixelRatio: number };
      };
      __engine?: {
        getState(): { topology: object };
      };
    };
    const topology = debugWindow.__engine?.getState().topology;

    window.livelyPropertyListener?.("quality", 2);

    return {
      maximumDevicePixelRatio:
        debugWindow.__config?.performance.maximumDevicePixelRatio,
      sameTopology: debugWindow.__engine?.getState().topology === topology,
    };
  });

  expect(result).toEqual({
    maximumDevicePixelRatio: 2.5,
    sameTopology: true,
  });
});

test("preset switching stops the previous engine RAF loop", async ({ page }) => {
  await page.goto("/?preset=paper");
  await waitForRuntime(page, "crumpled-paper");

  const frameAfterSwitch = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __engine?: {
        getState(): { time: { frame: number } };
      };
      __previousEngine?: {
        getState(): { time: { frame: number } };
      };
    };
    debugWindow.__previousEngine = debugWindow.__engine;
    window.livelyPropertyListener?.("preset", 2);
    return debugWindow.__previousEngine?.getState().time.frame ?? -1;
  });

  await waitForRuntime(page, "breathing-membrane");
  await page.waitForTimeout(100);

  const laterFrame = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __previousEngine?: {
        getState(): { time: { frame: number } };
      };
    };
    return debugWindow.__previousEngine?.getState().time.frame ?? -1;
  });

  expect(frameAfterSwitch).toBeGreaterThanOrEqual(0);
  expect(laterFrame).toBe(frameAfterSwitch);
});
