import { expect, test, type Page } from "@playwright/test";

interface WebGlCleanupSnapshot {
  bufferCreates: number;
  deletedBuffers: number;
  deletedPrograms: number;
  deletedShaders: number;
  canvasReplacements: number;
}

async function injectBufferFailure(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const prototype = WebGLRenderingContext.prototype;
    const originalCreateBuffer = prototype.createBuffer;
    const originalDeleteBuffer = prototype.deleteBuffer;
    const originalDeleteProgram = prototype.deleteProgram;
    const originalDeleteShader = prototype.deleteShader;
    const originalReplaceWith = Element.prototype.replaceWith;

    const debugWindow = window as typeof window & {
      __webglCleanup?: WebGlCleanupSnapshot;
    };
    debugWindow.__webglCleanup = {
      bufferCreates: 0,
      deletedBuffers: 0,
      deletedPrograms: 0,
      deletedShaders: 0,
      canvasReplacements: 0,
    };

    prototype.createBuffer = function (): WebGLBuffer | null {
      const snapshot = debugWindow.__webglCleanup!;
      snapshot.bufferCreates += 1;
      if (snapshot.bufferCreates === 3) return null;
      return originalCreateBuffer.call(this);
    };

    prototype.deleteBuffer = function (buffer: WebGLBuffer | null): void {
      if (buffer) debugWindow.__webglCleanup!.deletedBuffers += 1;
      originalDeleteBuffer.call(this, buffer);
    };

    prototype.deleteProgram = function (program: WebGLProgram | null): void {
      if (program) debugWindow.__webglCleanup!.deletedPrograms += 1;
      originalDeleteProgram.call(this, program);
    };

    prototype.deleteShader = function (shader: WebGLShader | null): void {
      if (shader) debugWindow.__webglCleanup!.deletedShaders += 1;
      originalDeleteShader.call(this, shader);
    };

    Element.prototype.replaceWith = function (...nodes: Array<Node | string>) {
      if (this instanceof HTMLCanvasElement) {
        debugWindow.__webglCleanup!.canvasReplacements += 1;
      }
      originalReplaceWith.apply(this, nodes);
    };
  });
}

async function waitForRuntime(page: Page, presetId: string): Promise<void> {
  await page.waitForFunction(
    (expectedPresetId) => {
      const debugWindow = window as typeof window & {
        __presetId?: string;
        __engine?: { getState(): { time: { frame: number } } };
      };
      return (
        debugWindow.__presetId === expectedPresetId &&
        (debugWindow.__engine?.getState().time.frame ?? 0) >= 2
      );
    },
    presetId,
  );
}

for (const testCase of [
  { query: "paper", presetId: "crumpled-paper" },
  { query: "membrane", presetId: "breathing-membrane" },
] as const) {
  test(`cleans partial WebGL resources before ${testCase.query} Canvas fallback`, async ({
    page,
  }) => {
    await injectBufferFailure(page);
    await page.goto(`/?preset=${testCase.query}`);
    await waitForRuntime(page, testCase.presetId);

    const result = await page.evaluate(() => {
      const debugWindow = window as typeof window & {
        __webglCleanup?: WebGlCleanupSnapshot;
      };
      const canvas = document.querySelector<HTMLCanvasElement>("#wallpaper");
      return {
        cleanup: debugWindow.__webglCleanup!,
        has2dContext: Boolean(canvas?.getContext("2d")),
      };
    });

    test.skip(
      result.cleanup.bufferCreates === 0,
      "WebGL is unavailable in this browser environment.",
    );

    expect(result.cleanup.bufferCreates).toBe(3);
    expect(result.cleanup.deletedBuffers).toBe(2);
    expect(result.cleanup.deletedPrograms).toBeGreaterThanOrEqual(1);
    expect(result.cleanup.deletedShaders).toBeGreaterThanOrEqual(2);
    expect(result.cleanup.canvasReplacements).toBeGreaterThanOrEqual(1);
    expect(result.has2dContext).toBe(true);
  });
}
