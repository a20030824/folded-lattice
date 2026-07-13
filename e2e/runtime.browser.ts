import {
  expect,
  test,
  type Page,
} from "@playwright/test";

interface RuntimeSnapshot {
  presetId: string | undefined;
  frame: number;
  elapsed: number;
  viewportWidth: number;
  viewportHeight: number;
  nodeCount: number;
  edgeCount: number;
  triangleCount: number;
  canvasWidth: number;
  canvasHeight: number;
  finite: boolean;
}

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location().url;
      errors.push(
        `console: ${message.text()}${location ? ` (${location})` : ""}`,
      );
    }
  });

  return errors;
}

const expectedFallbackPrefixes = [
  "console: WebGL paper renderer unavailable, falling back:",
  "console: WebGL membrane renderer unavailable, falling back:",
] as const;

function unexpectedBrowserErrors(errors: readonly string[]): string[] {
  return errors.filter(
    (error) =>
      !expectedFallbackPrefixes.some((prefix) => error.startsWith(prefix)),
  );
}

test.beforeEach(async ({ page }) => {
  await page.route("**/favicon.ico", (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
});

async function waitForRuntime(
  page: Page,
  expectedPresetId: string,
): Promise<void> {
  await page.waitForFunction(
    (presetId) => {
      const debugWindow = window as typeof window & {
        __presetId?: string;
        __engine?: {
          getState(): {
            time: { frame: number };
          };
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

async function readRuntimeSnapshot(
  page: Page,
): Promise<RuntimeSnapshot | null> {
  return page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __presetId?: string;
      __engine?: {
        getState(): {
          time: { frame: number; elapsed: number };
          viewport: { width: number; height: number };
          topology: {
            nodes: Array<{
              position: { x: number; y: number; z: number };
              velocity: { x: number; y: number; z: number };
            }>;
            edges: unknown[];
            triangles: unknown[];
          };
        };
      };
    };
    const canvas = document.querySelector<HTMLCanvasElement>("#wallpaper");
    const state = debugWindow.__engine?.getState();

    if (!canvas || !state) return null;

    const finite = state.topology.nodes.every((node) =>
      [
        node.position.x,
        node.position.y,
        node.position.z,
        node.velocity.x,
        node.velocity.y,
        node.velocity.z,
      ].every(Number.isFinite),
    );

    return {
      presetId: debugWindow.__presetId,
      frame: state.time.frame,
      elapsed: state.time.elapsed,
      viewportWidth: state.viewport.width,
      viewportHeight: state.viewport.height,
      nodeCount: state.topology.nodes.length,
      edgeCount: state.topology.edges.length,
      triangleCount: state.topology.triangles.length,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      finite,
    };
  });
}

const presetCases = [
  { query: "", expectedId: "crumpled-paper", label: "default" },
  { query: "paper", expectedId: "crumpled-paper", label: "paper" },
  {
    query: "crumpled-paper",
    expectedId: "crumpled-paper",
    label: "crumpled-paper",
  },
  { query: "ink", expectedId: "wandering-ink", label: "ink" },
  {
    query: "wandering-ink",
    expectedId: "wandering-ink",
    label: "wandering-ink",
  },
  {
    query: "membrane",
    expectedId: "breathing-membrane",
    label: "membrane",
  },
  {
    query: "breathing-membrane",
    expectedId: "breathing-membrane",
    label: "breathing-membrane",
  },
  { query: "tide", expectedId: "tide-archive", label: "tide" },
  { query: "archive", expectedId: "tide-archive", label: "archive" },
  {
    query: "tide-archive",
    expectedId: "tide-archive",
    label: "tide-archive",
  },
] as const;

for (const presetCase of presetCases) {
  test(`boots the ${presetCase.label} runtime`, async ({ page }) => {
    const errors = collectBrowserErrors(page);
    const path = presetCase.query ? `/?preset=${presetCase.query}` : "/";

    await page.goto(path, { waitUntil: "domcontentloaded" });
    await waitForRuntime(page, presetCase.expectedId);

    const snapshot = await readRuntimeSnapshot(page);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.presetId).toBe(presetCase.expectedId);
    expect(snapshot?.frame).toBeGreaterThanOrEqual(2);
    expect(snapshot?.elapsed).toBeGreaterThanOrEqual(0);
    expect(snapshot?.nodeCount).toBeGreaterThan(0);
    expect(snapshot?.edgeCount).toBeGreaterThan(0);
    expect(snapshot?.triangleCount).toBeGreaterThan(0);
    expect(snapshot?.canvasWidth).toBeGreaterThan(1);
    expect(snapshot?.canvasHeight).toBeGreaterThan(1);
    expect(snapshot?.finite).toBe(true);
    expect(unexpectedBrowserErrors(errors)).toEqual([]);
  });
}

test("switches presets through the Lively bridge", async ({ page }) => {
  const errors = collectBrowserErrors(page);

  await page.goto("/?preset=paper");
  await waitForRuntime(page, "crumpled-paper");
  await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __previousCanvas?: HTMLCanvasElement;
    };
    debugWindow.__previousCanvas =
      document.querySelector<HTMLCanvasElement>("#wallpaper") ?? undefined;
    window.livelyPropertyListener?.("preset", 2);
  });

  await waitForRuntime(page, "breathing-membrane");
  const membraneResult = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __previousCanvas?: HTMLCanvasElement;
      __presetId?: string;
    };
    const current = document.querySelector<HTMLCanvasElement>("#wallpaper");
    return {
      presetId: debugWindow.__presetId,
      replaced: Boolean(
        debugWindow.__previousCanvas &&
          current !== debugWindow.__previousCanvas &&
          !debugWindow.__previousCanvas.isConnected,
      ),
    };
  });
  expect(membraneResult).toEqual({
    presetId: "breathing-membrane",
    replaced: true,
  });

  await page.evaluate(() => window.livelyPropertyListener?.("preset", 1));
  await waitForRuntime(page, "wandering-ink");
  await page.evaluate(() => window.livelyPropertyListener?.("preset", 3));
  await waitForRuntime(page, "tide-archive");

  expect(unexpectedBrowserErrors(errors)).toEqual([]);
});

test("handles pointer input and rebuilds after resize", async ({ page }) => {
  const errors = collectBrowserErrors(page);

  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto("/?preset=membrane");
  await waitForRuntime(page, "breathing-membrane");
  await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __topologyBeforeResize?: object;
      __engine?: { getState(): { topology: object } };
    };
    debugWindow.__topologyBeforeResize = debugWindow.__engine?.getState().topology;
  });

  const canvas = page.locator("#wallpaper");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const centerX = bounds!.x + bounds!.width * 0.5;
  const centerY = bounds!.y + bounds!.height * 0.5;

  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const debugWindow = window as typeof window & {
          __engine?: { getState(): { pointer: { isDown: boolean } } };
        };
        return debugWindow.__engine?.getState().pointer.isDown ?? false;
      }),
    )
    .toBe(true);
  await page.mouse.move(centerX + 30, centerY + 20);
  await page.mouse.up();

  const pointerResult = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __engine?: {
        getState(): {
          pointer: {
            isInside: boolean;
            isDown: boolean;
            position: { x: number; y: number };
          };
        };
      };
    };
    return debugWindow.__engine?.getState().pointer;
  });
  expect(pointerResult?.isInside).toBe(true);
  expect(pointerResult?.isDown).toBe(false);
  expect(pointerResult?.position.x).toBeGreaterThan(0);
  expect(pointerResult?.position.y).toBeGreaterThan(0);

  await page.setViewportSize({ width: 640, height: 480 });
  await page.waitForFunction(() => {
    const debugWindow = window as typeof window & {
      __engine?: {
        getState(): {
          viewport: { width: number; height: number };
          topology: object;
        };
      };
      __topologyBeforeResize?: object;
    };
    const state = debugWindow.__engine?.getState();
    return Boolean(
      state &&
        state.viewport.width === 640 &&
        state.viewport.height === 480 &&
        state.topology !== debugWindow.__topologyBeforeResize,
    );
  });

  const snapshot = await readRuntimeSnapshot(page);
  expect(snapshot?.viewportWidth).toBe(640);
  expect(snapshot?.viewportHeight).toBe(480);
  expect(snapshot?.finite).toBe(true);
  expect(unexpectedBrowserErrors(errors)).toEqual([]);
});

async function disableWebGl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const prototype = HTMLCanvasElement.prototype as unknown as {
      getContext(
        contextId: string,
        ...args: unknown[]
      ): RenderingContext | null;
    };
    const originalGetContext = prototype.getContext;
    const originalReplaceWith = Element.prototype.replaceWith;
    const debugWindow = window as typeof window & {
      __canvasReplacementCount?: number;
    };
    debugWindow.__canvasReplacementCount = 0;

    Element.prototype.replaceWith = function (...nodes: Array<Node | string>) {
      if (this instanceof HTMLCanvasElement) {
        debugWindow.__canvasReplacementCount =
          (debugWindow.__canvasReplacementCount ?? 0) + 1;
      }
      originalReplaceWith.apply(this, nodes);
    };

    prototype.getContext = function (contextId, ...args) {
      if (contextId === "webgl" || contextId === "experimental-webgl") {
        return null;
      }
      return originalGetContext.call(this, contextId, ...args);
    };
  });
}

for (const fallbackCase of [
  {
    query: "paper",
    expectedId: "crumpled-paper",
    expectedLog: "WebGL paper renderer unavailable, falling back:",
  },
  {
    query: "membrane",
    expectedId: "breathing-membrane",
    expectedLog: "WebGL membrane renderer unavailable, falling back:",
  },
] as const) {
  test(`uses Canvas fallback for ${fallbackCase.query}`, async ({ page }) => {
    const errors = collectBrowserErrors(page);
    await disableWebGl(page);
    await page.goto(`/?preset=${fallbackCase.query}`);
    await waitForRuntime(page, fallbackCase.expectedId);

    const result = await page.evaluate(() => {
      const debugWindow = window as typeof window & {
        __canvasReplacementCount?: number;
        __engine?: { getState(): { time: { frame: number } } };
      };
      const canvas = document.querySelector<HTMLCanvasElement>("#wallpaper");
      return {
        replacementCount: debugWindow.__canvasReplacementCount ?? 0,
        has2dContext: Boolean(canvas?.getContext("2d")),
        frame: debugWindow.__engine?.getState().time.frame ?? 0,
      };
    });

    expect(result.replacementCount).toBeGreaterThanOrEqual(1);
    expect(result.has2dContext).toBe(true);
    expect(result.frame).toBeGreaterThanOrEqual(2);
    expect(errors.some((error) => error.includes(fallbackCase.expectedLog))).toBe(true);
    expect(unexpectedBrowserErrors(errors)).toEqual([]);
  });
}
