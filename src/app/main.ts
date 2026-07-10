import "./styles.css";

import { createEngine } from "../core/createEngine";
import { createCanvasRenderer } from "../core/render/canvasRenderer";
import { createPaperRenderer } from "../core/render/paperRenderer";
import type { Viewport } from "../core/types";
import { breathingMembranePreset } from "../presets/breathingMembrane";
import { crumpledPaperPreset } from "../presets/crumpledPaper";
import { installLivelyBridge } from "../wallpaper/lively";
import { bindPointerInput } from "../wallpaper/pointer";

const canvas = document.querySelector<HTMLCanvasElement>("#wallpaper");
if (!canvas) throw new Error('Canvas element "#wallpaper" was not found.');

const getViewport = (): Viewport => ({
  width: Math.max(1, window.innerWidth),
  height: Math.max(1, window.innerHeight),
  devicePixelRatio: window.devicePixelRatio || 1,
});

// ?preset=paper switches to the crumpled-paper prototype; default stays v1.
const presetName = new URLSearchParams(window.location.search).get("preset");
const preset = presetName === "paper" ? crumpledPaperPreset : breathingMembranePreset;
const renderer =
  preset.id === "crumpled-paper"
    ? createPaperRenderer(canvas)
    : createCanvasRenderer(canvas);
const engine = createEngine(preset, renderer, getViewport());
// Debug handle for tuning sessions; harmless in production wallpapers.
(window as unknown as { __engine: typeof engine }).__engine = engine;
const unbindPointer = bindPointerInput(canvas, engine.getState);
const removeLivelyBridge = installLivelyBridge(preset.config, {
  rebuildTopology: engine.rebuildTopology,
  refreshRenderer: () => engine.resize(getViewport()),
});

let resizeFrame = 0;
const onResize = (): void => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => engine.resize(getViewport()));
};
const onVisibilityChange = (): void => {
  if (document.hidden) engine.stop();
  else engine.start();
};
const dispose = (): void => {
  cancelAnimationFrame(resizeFrame);
  window.removeEventListener("resize", onResize);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  unbindPointer();
  removeLivelyBridge();
  engine.dispose();
};

window.addEventListener("resize", onResize);
window.addEventListener("beforeunload", dispose, { once: true });
document.addEventListener("visibilitychange", onVisibilityChange);
engine.start();
