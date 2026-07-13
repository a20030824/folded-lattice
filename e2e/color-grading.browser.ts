import { expect, test } from "@playwright/test";

test("Lively color grading changes palette without rebuilding topology", async ({
  page,
}) => {
  await page.goto("/?preset=paper");
  await page.waitForFunction(() => {
    const debugWindow = window as typeof window & {
      __presetId?: string;
      __engine?: { getState(): { time: { frame: number } } };
    };
    return (
      debugWindow.__presetId === "crumpled-paper" &&
      (debugWindow.__engine?.getState().time.frame ?? 0) >= 2
    );
  });

  const result = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __config?: { render: { colors: { background: string } } };
      __engine?: { getState(): { topology: object } };
    };
    const originalBackground = debugWindow.__config!.render.colors.background;
    const topology = debugWindow.__engine!.getState().topology;

    window.livelyPropertyListener?.("brightness", 130);
    window.livelyPropertyListener?.("temperature", 55);
    window.livelyPropertyListener?.("tint", -30);

    const gradedBackground = debugWindow.__config!.render.colors.background;
    const sameTopology = debugWindow.__engine!.getState().topology === topology;

    window.livelyPropertyListener?.("brightness", 100);
    window.livelyPropertyListener?.("temperature", 0);
    window.livelyPropertyListener?.("tint", 0);

    return {
      originalBackground,
      gradedBackground,
      restoredBackground: debugWindow.__config!.render.colors.background,
      sameTopology,
    };
  });

  expect(result.gradedBackground).not.toBe(result.originalBackground);
  expect(result.restoredBackground).toBe(result.originalBackground);
  expect(result.sameTopology).toBe(true);
});
