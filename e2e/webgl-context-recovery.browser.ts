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

test("WebGL context loss restarts the active preset on a fresh canvas", async ({
  page,
}) => {
  await page.goto("/?preset=paper");
  await waitForRuntime(page, "crumpled-paper");

  const before = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __config?: {
        performance: { maximumDevicePixelRatio: number };
        render: { colors: { background: string } };
      };
      __engine?: {
        getState(): { time: { frame: number } };
      };
      __lostCanvas?: HTMLCanvasElement;
      __lostEngine?: {
        getState(): { time: { frame: number } };
      };
    };

    window.livelyPropertyListener?.("brightness", 130);
    window.livelyPropertyListener?.("quality", 2);

    const activeCanvas = document.querySelector<HTMLCanvasElement>("#wallpaper");
    const activeEngine = debugWindow.__engine;
    if (!activeCanvas || !activeEngine || !debugWindow.__config) {
      throw new Error("Active WebGL paper runtime was not available.");
    }

    debugWindow.__lostCanvas = activeCanvas;
    debugWindow.__lostEngine = activeEngine;

    const event = new Event("webglcontextlost", { cancelable: true });
    activeCanvas.dispatchEvent(event);

    return {
      background: debugWindow.__config.render.colors.background,
      maximumDevicePixelRatio:
        debugWindow.__config.performance.maximumDevicePixelRatio,
      prevented: event.defaultPrevented,
    };
  });

  expect(before.prevented).toBe(true);

  await page.waitForFunction(() => {
    const debugWindow = window as typeof window & {
      __engine?: object;
      __lostCanvas?: HTMLCanvasElement;
      __lostEngine?: object;
    };
    return (
      debugWindow.__engine !== debugWindow.__lostEngine &&
      document.querySelector<HTMLCanvasElement>("#wallpaper") !==
        debugWindow.__lostCanvas
    );
  });
  await waitForRuntime(page, "crumpled-paper");

  const oldFrameAfterRecovery = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __lostEngine?: {
        getState(): { time: { frame: number } };
      };
    };
    return debugWindow.__lostEngine?.getState().time.frame ?? -1;
  });

  await page.waitForTimeout(100);

  const after = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __config?: {
        performance: { maximumDevicePixelRatio: number };
        render: { colors: { background: string } };
      };
      __lostCanvas?: HTMLCanvasElement;
      __lostEngine?: {
        getState(): { time: { frame: number } };
      };
      __presetId?: string;
    };
    return {
      background: debugWindow.__config?.render.colors.background,
      canvasCount: document.querySelectorAll("#wallpaper").length,
      maximumDevicePixelRatio:
        debugWindow.__config?.performance.maximumDevicePixelRatio,
      oldFrame: debugWindow.__lostEngine?.getState().time.frame ?? -1,
      presetId: debugWindow.__presetId,
      replacedCanvas:
        document.querySelector<HTMLCanvasElement>("#wallpaper") !==
        debugWindow.__lostCanvas,
    };
  });

  expect(after).toEqual({
    background: before.background,
    canvasCount: 1,
    maximumDevicePixelRatio: before.maximumDevicePixelRatio,
    oldFrame: oldFrameAfterRecovery,
    presetId: "crumpled-paper",
    replacedCanvas: true,
  });
});
