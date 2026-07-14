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

test("Lively values replay into a newly selected preset", async ({ page }) => {
  await page.goto("/?preset=paper");
  await waitForRuntime(page, "crumpled-paper");

  await page.evaluate(() => {
    window.livelyPropertyListener?.("brightness", 130);
    window.livelyPropertyListener?.("quality", 2);
    window.livelyPropertyListener?.("mouseInteraction", false);
    // Paper does not support this binding, but the value should be retained
    // and applied when the membrane preset is staged.
    window.livelyPropertyListener?.("memoryStrength", 150);
    window.livelyPropertyListener?.("preset", 2);
  });

  await waitForRuntime(page, "breathing-membrane");

  const result = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __config?: {
        fields: { pointer: { enabled: boolean } };
        memory: { edgeRestLengthInfluence: number };
        performance: { maximumDevicePixelRatio: number };
        render: { colors: { background: string } };
      };
    };
    return {
      background: debugWindow.__config?.render.colors.background,
      edgeRestLengthInfluence:
        debugWindow.__config?.memory.edgeRestLengthInfluence,
      maximumDevicePixelRatio:
        debugWindow.__config?.performance.maximumDevicePixelRatio,
      mouseInteraction: debugWindow.__config?.fields.pointer.enabled,
    };
  });

  expect(result).toEqual({
    background: "#0d121a",
    edgeRestLengthInfluence: 0.018000000000000002,
    maximumDevicePixelRatio: 2.5,
    mouseInteraction: false,
  });
});

test("failed preset commit keeps the previous runtime active", async ({ page }) => {
  await page.goto("/?preset=paper");
  await waitForRuntime(page, "crumpled-paper");

  const before = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __presetId?: string;
      __config?: {
        performance: { maximumDevicePixelRatio: number };
      };
      __engine?: {
        getState(): { time: { frame: number } };
      };
      __stableEngine?: {
        getState(): { time: { frame: number } };
      };
      __stableCanvas?: HTMLCanvasElement;
    };
    const activeCanvas = document.querySelector<HTMLCanvasElement>("#wallpaper");
    const activeEngine = debugWindow.__engine;
    if (!activeCanvas || !activeEngine) {
      throw new Error("Active paper runtime was not available.");
    }

    debugWindow.__stableCanvas = activeCanvas;
    debugWindow.__stableEngine = activeEngine;
    const frame = activeEngine.getState().time.frame;

    Object.defineProperty(activeCanvas, "replaceWith", {
      configurable: true,
      writable: true,
      value: () => {
        throw new Error("Injected preset commit failure.");
      },
    });
    try {
      window.livelyPropertyListener?.("preset", 1);
    } finally {
      Reflect.deleteProperty(activeCanvas, "replaceWith");
    }

    // The listener must have rolled back to the paper runtime.
    window.livelyPropertyListener?.("quality", 2);

    return {
      frame,
      maximumDevicePixelRatio:
        debugWindow.__config?.performance.maximumDevicePixelRatio,
      presetId: debugWindow.__presetId,
      sameCanvas:
        document.querySelector<HTMLCanvasElement>("#wallpaper") === activeCanvas,
      sameEngine: debugWindow.__engine === activeEngine,
    };
  });

  expect(before).toEqual({
    frame: expect.any(Number),
    maximumDevicePixelRatio: 2.5,
    presetId: "crumpled-paper",
    sameCanvas: true,
    sameEngine: true,
  });

  await page.waitForTimeout(100);

  const after = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __presetId?: string;
      __engine?: {
        getState(): { time: { frame: number } };
      };
      __stableEngine?: {
        getState(): { time: { frame: number } };
      };
      __stableCanvas?: HTMLCanvasElement;
    };
    return {
      canvasCount: document.querySelectorAll("#wallpaper").length,
      frame: debugWindow.__engine?.getState().time.frame ?? -1,
      presetId: debugWindow.__presetId,
      sameCanvas:
        document.querySelector<HTMLCanvasElement>("#wallpaper") ===
        debugWindow.__stableCanvas,
      sameEngine: debugWindow.__engine === debugWindow.__stableEngine,
    };
  });

  expect(after.canvasCount).toBe(1);
  expect(after.frame).toBeGreaterThan(before.frame);
  expect(after.presetId).toBe("crumpled-paper");
  expect(after.sameCanvas).toBe(true);
  expect(after.sameEngine).toBe(true);
});
