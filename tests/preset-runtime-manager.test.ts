import { describe, expect, it, vi } from "vitest";
import type { FoldedLatticeConfig } from "../src/core/config";
import type {
  PresetDefinition,
  Renderer,
} from "../src/core/contracts";
import type { FoldedLatticeEngine } from "../src/core/createEngine";
import type { Viewport } from "../src/core/types";
import { createPresetRuntimeManager } from "../src/app/presetRuntimeManager";

class FakeCanvas {
  readonly id: string;
  failReplace = false;
  replacement: FakeCanvas | null = null;

  constructor(id: string) {
    this.id = id;
  }

  cloneNode(): FakeCanvas {
    return new FakeCanvas(`${this.id}-clone`);
  }

  replaceWith(replacement: FakeCanvas): void {
    if (this.failReplace) throw new Error("Injected canvas commit failure.");
    this.replacement = replacement;
  }
}

interface EngineRecord {
  engine: FoldedLatticeEngine;
  renderer: Renderer;
}

function createHarness() {
  const viewport: Viewport = {
    width: 1280,
    height: 720,
    devicePixelRatio: 2,
  };
  const rootCanvas = new FakeCanvas("root");
  const renderers: Renderer[] = [];
  const engines: EngineRecord[] = [];
  const cleanupEvents: string[] = [];
  const commits: Array<{ presetId: string; mode: string | null }> = [];
  const errors: string[] = [];
  let failEngineCreation = false;

  const createDefinition = (id: string): PresetDefinition => ({
    id,
    aliases: [id],
    displayName: id,
    description: id,
    createConfig: () => ({}) as FoldedLatticeConfig,
    createRenderer(canvas) {
      const renderer: Renderer = {
        resize: vi.fn(),
        render: vi.fn(),
        dispose: vi.fn(),
      };
      renderers.push(renderer);
      return { canvas, renderer };
    },
    applyMode: vi.fn(),
    createPropertyBindings: () => [],
    topologyBuilder: {
      build: vi.fn(),
    },
    simulationSystems: [],
    frameSystems: [],
  });

  const definitions = new Map([
    ["alpha", createDefinition("alpha")],
    ["beta", createDefinition("beta")],
  ]);

  const services = {
    resolvePreset(name: string | null) {
      return definitions.get(name ?? "alpha") ?? definitions.get("alpha")!;
    },
    createRendererWithWebglCleanup(
      _canvas: HTMLCanvasElement,
      createRenderer: () => { canvas: HTMLCanvasElement; renderer: Renderer },
    ) {
      return createRenderer();
    },
    createEngine(
      _definition: PresetDefinition,
      _config: FoldedLatticeConfig,
      renderer: Renderer,
    ): FoldedLatticeEngine {
      if (failEngineCreation) throw new Error("Injected engine failure.");
      const index = engines.length;
      const engine: FoldedLatticeEngine = {
        start: vi.fn(),
        stop: vi.fn(),
        resize: vi.fn(),
        refreshRenderer: vi.fn(),
        rebuildTopology: vi.fn(),
        getState: vi.fn(() => ({}) as never),
        dispose: vi.fn(() => {
          cleanupEvents.push(`${index}:engine`);
          renderer.dispose();
        }),
      };
      engines.push({ engine, renderer });
      return engine;
    },
    bindPointerInput() {
      const index = engines.length - 1;
      return vi.fn(() => cleanupEvents.push(`${index}:pointer`));
    },
    createPresetColorGradingBindings() {
      return [];
    },
    installLivelyBridge() {
      const index = engines.length - 1;
      return vi.fn(() => cleanupEvents.push(`${index}:lively`));
    },
    bindWebglContextRecovery() {
      const index = engines.length - 1;
      return vi.fn(() => cleanupEvents.push(`${index}:recovery`));
    },
    shouldForceCanvasFallback: vi.fn(() => false),
  };

  const manager = createPresetRuntimeManager({
    canvas: rootCanvas as unknown as HTMLCanvasElement,
    getViewport: () => viewport,
    isHidden: () => false,
    getCurrentMode: () => null,
    onCommit(snapshot) {
      commits.push({ presetId: snapshot.presetId, mode: snapshot.mode });
    },
    onError(message) {
      errors.push(message);
    },
    onWarning: vi.fn(),
    services: services as never,
  });

  return {
    cleanupEvents,
    commits,
    engines,
    errors,
    manager,
    renderers,
    rootCanvas,
    setFailEngineCreation(value: boolean) {
      failEngineCreation = value;
    },
    viewport,
  };
}

describe("preset runtime manager", () => {
  it("commits switches atomically and owns visibility, resize, and disposal", () => {
    const harness = createHarness();

    expect(harness.manager.startPreset("alpha", { mode: "first" })).toBe(true);
    expect(harness.rootCanvas.replacement).not.toBeNull();
    expect(harness.engines[0]!.engine.start).toHaveBeenCalledTimes(1);
    expect(harness.commits).toEqual([{ presetId: "alpha", mode: "first" }]);

    expect(harness.manager.startPreset("alpha", { mode: "first" })).toBe(false);
    expect(harness.engines).toHaveLength(1);

    expect(harness.manager.startPreset("beta", { mode: "second" })).toBe(true);
    expect(harness.cleanupEvents).toEqual([
      "0:recovery",
      "0:pointer",
      "0:lively",
      "0:engine",
    ]);
    expect(harness.commits).toEqual([
      { presetId: "alpha", mode: "first" },
      { presetId: "beta", mode: "second" },
    ]);

    harness.manager.resize();
    expect(harness.engines[1]!.engine.resize).toHaveBeenCalledWith(
      harness.viewport,
    );
    harness.manager.setVisible(false);
    harness.manager.setVisible(true);
    expect(harness.engines[1]!.engine.stop).toHaveBeenCalledTimes(1);
    expect(harness.engines[1]!.engine.start).toHaveBeenCalledTimes(2);

    harness.manager.dispose();
    harness.manager.dispose();
    expect(harness.cleanupEvents).toEqual([
      "0:recovery",
      "0:pointer",
      "0:lively",
      "0:engine",
      "1:recovery",
      "1:pointer",
      "1:lively",
      "1:engine",
    ]);
    expect(harness.manager.getActiveRuntime()).toBeNull();
    expect(harness.manager.startPreset("alpha")).toBe(false);
  });

  it("keeps the active runtime when staging fails", () => {
    const harness = createHarness();
    harness.manager.startPreset("alpha");
    const active = harness.manager.getActiveRuntime();

    harness.setFailEngineCreation(true);
    expect(harness.manager.startPreset("beta")).toBe(false);

    expect(harness.manager.getActiveRuntime()).toEqual(active);
    expect(harness.engines).toHaveLength(1);
    expect(harness.engines[0]!.engine.dispose).not.toHaveBeenCalled();
    expect(harness.renderers[1]!.dispose).toHaveBeenCalledTimes(1);
    expect(harness.errors).toEqual([
      'Failed to stage preset "beta":',
    ]);
  });

  it("discards a complete candidate when the canvas commit fails", () => {
    const harness = createHarness();
    harness.manager.startPreset("alpha");
    const active = harness.manager.getActiveRuntime()!;
    (active.canvas as unknown as FakeCanvas).failReplace = true;

    expect(harness.manager.startPreset("beta")).toBe(false);

    expect(harness.manager.getActiveRuntime()).toEqual(active);
    expect(harness.engines[0]!.engine.dispose).not.toHaveBeenCalled();
    expect(harness.engines[1]!.engine.dispose).toHaveBeenCalledTimes(1);
    expect(harness.cleanupEvents).toEqual([
      "1:recovery",
      "1:pointer",
      "1:lively",
      "1:engine",
    ]);
    expect(harness.errors).toEqual([
      'Failed to commit preset "beta":',
    ]);
  });
});
