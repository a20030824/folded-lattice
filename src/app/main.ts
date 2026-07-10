import "./styles.css";

import { createEngine } from "../core/createEngine";
import { createCanvasRenderer } from "../core/render/canvasRenderer";
import { createPaperRenderer } from "../core/render/paperRenderer";
import { createWebglPaperRenderer } from "../core/render/webglPaperRenderer";
import type { Viewport } from "../core/types";
import { breathingMembranePreset } from "../presets/breathingMembrane";
import { crumpledPaperPreset } from "../presets/crumpledPaper";
import { installLivelyBridge } from "../wallpaper/lively";
import { bindPointerInput } from "../wallpaper/pointer";

let canvas = document.querySelector<HTMLCanvasElement>("#wallpaper");
if (!canvas) throw new Error('Canvas element "#wallpaper" was not found.');

const getViewport = (): Viewport => ({
  width: Math.max(1, window.innerWidth),
  height: Math.max(1, window.innerHeight),
  devicePixelRatio: window.devicePixelRatio || 1,
});

// ?preset=paper switches to the crumpled-paper prototype; default stays v1.
const presetName = new URLSearchParams(window.location.search).get("preset");
const preset = presetName === "paper" ? crumpledPaperPreset : breathingMembranePreset;
function createRendererFor(presetId: string): ReturnType<typeof createCanvasRenderer> {
  if (presetId !== "crumpled-paper") return createCanvasRenderer(canvas!);
  try {
    return createWebglPaperRenderer(canvas!);
  } catch (error) {
    console.error("WebGL paper renderer unavailable, falling back:", error);
    // A canvas that has held a WebGL context cannot hand out a 2D one;
    // swap in a fresh element for the Canvas 2D fallback.
    const replacement = canvas!.cloneNode(false) as HTMLCanvasElement;
    canvas!.replaceWith(replacement);
    canvas = replacement;
    return createPaperRenderer(replacement);
  }
}
const renderer = createRendererFor(preset.id);
const engine = createEngine(preset, renderer, getViewport());
// Debug handles for tuning sessions; harmless in production wallpapers.
(window as unknown as { __engine: typeof engine }).__engine = engine;
(window as unknown as { __config: typeof preset.config }).__config = preset.config;
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
