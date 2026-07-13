import "./styles.css";

import { createEngine } from "../core/createEngine";
import type { FoldedLatticeEngine } from "../core/createEngine";
import type { Viewport } from "../core/types";
import { resolvePreset } from "../presets/registry";
import { installLivelyBridge } from "../wallpaper/lively";
import { bindPointerInput } from "../wallpaper/pointer";

let canvas = document.querySelector<HTMLCanvasElement>("#wallpaper");
if (!canvas) throw new Error('Canvas element "#wallpaper" was not found.');

const getViewport = (): Viewport => ({
  width: Math.max(1, window.innerWidth),
  height: Math.max(1, window.innerHeight),
  devicePixelRatio: window.devicePixelRatio || 1,
});

const urlParameters = new URLSearchParams(window.location.search);
interface ActiveRuntime {
  presetId: string;
  engine: FoldedLatticeEngine;
  unbindPointer(): void;
  removeLivelyBridge(): void;
}

let runtime: ActiveRuntime | null = null;

function replaceCanvas(): void {
  const replacement = canvas!.cloneNode(false) as HTMLCanvasElement;
  canvas!.replaceWith(replacement);
  canvas = replacement;
}

function startPreset(name: string | null): void {
  const definition = resolvePreset(name);
  if (runtime?.presetId === definition.id) return;

  if (runtime) {
    runtime.unbindPointer();
    runtime.removeLivelyBridge();
    runtime.engine.dispose();
    replaceCanvas();
  }

  const config = definition.createConfig();
  definition.applyMode?.(config, urlParameters.get("mode"));

  const rendererResult = definition.createRenderer(canvas!, config);
  canvas = rendererResult.canvas;

  const engine = createEngine(
    definition,
    config,
    rendererResult.renderer,
    getViewport(),
  );
  const unbindPointer = bindPointerInput(canvas!, engine.getState);
  const propertyBindings = definition.createPropertyBindings(config);
  const removeLivelyBridge = installLivelyBridge(propertyBindings, {
    rebuildTopology: engine.rebuildTopology,
    refreshRenderer: () => engine.resize(getViewport()),
    selectPreset: startPreset,
  });

  runtime = {
    presetId: definition.id,
    engine,
    unbindPointer,
    removeLivelyBridge,
  };
  // Debug handles for tuning sessions; harmless in production wallpapers.
  (window as unknown as { __engine: typeof engine }).__engine = engine;
  (window as unknown as { __config: typeof config }).__config = config;
  (window as unknown as { __presetId: string }).__presetId = definition.id;
  if (!document.hidden) engine.start();
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
  runtime?.unbindPointer();
  runtime?.removeLivelyBridge();
  runtime?.engine.dispose();
  runtime = null;
};

window.addEventListener("resize", onResize);
window.addEventListener("beforeunload", dispose, { once: true });
document.addEventListener("visibilitychange", onVisibilityChange);
startPreset(urlParameters.get("preset"));
