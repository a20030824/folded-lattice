import "./styles.css";

import type { FoldedLatticeConfig } from "../core/config";
import type { Renderer } from "../core/contracts";
import { createEngine } from "../core/createEngine";
import type { FoldedLatticeEngine } from "../core/createEngine";
import type { Viewport } from "../core/types";
import { resolvePreset } from "../presets/registry";
import { createPresetColorGradingBindings } from "../wallpaper/colorGrading";
import {
  createLivelyPropertyValues,
  installLivelyBridge,
} from "../wallpaper/lively";
import { bindPointerInput } from "../wallpaper/pointer";
import { bindWebglContextRecovery } from "../wallpaper/webglContextRecovery";
import { createRendererWithWebglCleanup } from "../wallpaper/webglInitialization";

let canvas = document.querySelector<HTMLCanvasElement>("#wallpaper");
if (!canvas) throw new Error('Canvas element "#wallpaper" was not found.');

const getViewport = (): Viewport => ({
  width: Math.max(1, window.innerWidth),
  height: Math.max(1, window.innerHeight),
  devicePixelRatio: window.devicePixelRatio || 1,
});

const urlParameters = new URLSearchParams(window.location.search);
const livelyPropertyValues = createLivelyPropertyValues();
interface ActiveRuntime {
  presetId: string;
  engine: FoldedLatticeEngine;
  unbindPointer(): void;
  removeLivelyBridge(): void;
  removeWebglContextRecovery(): void;
}

interface StagedPreset {
  canvas: HTMLCanvasElement;
  config: FoldedLatticeConfig;
  runtime: ActiveRuntime;
}

let runtime: ActiveRuntime | null = null;

function runCleanup(label: string, cleanup: () => void): void {
  try {
    cleanup();
  } catch (error) {
    console.error(`Failed to ${label}:`, error);
  }
}

function disposeRuntime(target: ActiveRuntime): void {
  runCleanup(
    "remove preset WebGL context recovery",
    target.removeWebglContextRecovery,
  );
  runCleanup("unbind preset pointer input", target.unbindPointer);
  runCleanup("remove preset Lively bridge", target.removeLivelyBridge);
  runCleanup("dispose preset engine", target.engine.dispose);
}

function startPreset(name: string | null, forceRestart = false): void {
  const definition = resolvePreset(name);
  if (!forceRestart && runtime?.presetId === definition.id) return;

  const previousRuntime = runtime;
  const previousCanvas = canvas!;
  const stagingCanvas = previousCanvas.cloneNode(false) as HTMLCanvasElement;
  let candidateRenderer: Renderer | null = null;
  let candidateEngine: FoldedLatticeEngine | null = null;
  let unbindPointer: (() => void) | null = null;
  let removeLivelyBridge: (() => void) | null = null;
  let removeWebglContextRecovery: (() => void) | null = null;
  let staged: StagedPreset | null = null;

  const discardCandidate = (): void => {
    if (removeWebglContextRecovery) {
      runCleanup(
        "remove staged WebGL context recovery",
        removeWebglContextRecovery,
      );
    }
    if (removeLivelyBridge) {
      runCleanup("remove staged Lively bridge", removeLivelyBridge);
    }
    if (unbindPointer) runCleanup("unbind staged pointer input", unbindPointer);
    if (candidateEngine) {
      runCleanup("dispose staged engine", candidateEngine.dispose);
    } else if (candidateRenderer) {
      runCleanup("dispose staged renderer", candidateRenderer.dispose);
    }
  };

  try {
    const config = definition.createConfig();
    definition.applyMode?.(config, urlParameters.get("mode"));

    const rendererResult = createRendererWithWebglCleanup(stagingCanvas, () =>
      definition.createRenderer(stagingCanvas, config),
    );
    candidateRenderer = rendererResult.renderer;

    const engine = createEngine(
      definition,
      config,
      candidateRenderer,
      getViewport(),
    );
    candidateEngine = engine;
    unbindPointer = bindPointerInput(rendererResult.canvas, engine.getState);
    const propertyBindings = [
      ...definition.createPropertyBindings(config),
      ...createPresetColorGradingBindings(definition.id, config),
    ];
    removeLivelyBridge = installLivelyBridge(
      propertyBindings,
      {
        presetId: definition.id,
        rebuildTopology: engine.rebuildTopology,
        refreshRenderer: engine.refreshRenderer,
        selectPreset: startPreset,
      },
      livelyPropertyValues,
    );

    const activeCanvas = rendererResult.canvas;
    removeWebglContextRecovery = bindWebglContextRecovery(activeCanvas, () => {
      if (canvas !== activeCanvas || runtime?.engine !== engine) return;
      console.warn(
        `WebGL context lost for preset "${definition.id}"; restarting the renderer.`,
      );
      startPreset(definition.id, true);
    });

    if (!document.hidden) engine.start();

    staged = {
      canvas: activeCanvas,
      config,
      runtime: {
        presetId: definition.id,
        engine,
        unbindPointer,
        removeLivelyBridge,
        removeWebglContextRecovery,
      },
    };
  } catch (error) {
    discardCandidate();
    console.error(`Failed to stage preset "${definition.id}":`, error);
    return;
  }

  if (!staged) return;

  try {
    previousCanvas.replaceWith(staged.canvas);
  } catch (error) {
    discardCandidate();
    console.error(`Failed to commit preset "${definition.id}":`, error);
    return;
  }

  canvas = staged.canvas;
  runtime = staged.runtime;

  // Debug handles for tuning sessions; harmless in production wallpapers.
  (window as unknown as { __engine: FoldedLatticeEngine }).__engine =
    staged.runtime.engine;
  (window as unknown as { __config: FoldedLatticeConfig }).__config = staged.config;
  (window as unknown as { __presetId: string }).__presetId = definition.id;

  if (previousRuntime) disposeRuntime(previousRuntime);
}

let resizeTimer = 0;
const onResize = (): void => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(
    () => runtime?.engine.resize(getViewport()),
    150,
  );
};
const onVisibilityChange = (): void => {
  if (document.hidden) runtime?.engine.stop();
  else runtime?.engine.start();
};
const dispose = (): void => {
  window.clearTimeout(resizeTimer);
  window.removeEventListener("resize", onResize);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  if (runtime) disposeRuntime(runtime);
  runtime = null;
};

window.addEventListener("resize", onResize);
window.addEventListener("beforeunload", dispose, { once: true });
document.addEventListener("visibilitychange", onVisibilityChange);
startPreset(urlParameters.get("preset"));
