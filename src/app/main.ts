import "./styles.css";

import { createEngine } from "../core/createEngine";
import type { FoldedLatticeEngine } from "../core/createEngine";
import type { PresetDefinition } from "../core/contracts";
import { createCanvasRenderer } from "../core/render/canvasRenderer";
import { createContourRenderer } from "../core/render/contourRenderer";
import { createInkRenderer } from "../core/render/inkRenderer";
import { createPaperRenderer } from "../core/render/paperRenderer";
import { createWebglMembraneRenderer } from "../core/render/webglMembraneRenderer";
import { createWebglPaperRenderer } from "../core/render/webglPaperRenderer";
import type { Viewport } from "../core/types";
import { breathingMembranePreset } from "../presets/breathingMembrane";
import { crumpledPaperPreset } from "../presets/crumpledPaper";
import { tideArchivePreset } from "../presets/tideArchive";
import { wanderingInkPreset } from "../presets/wanderingInk";
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

function resolvePreset(name: string | null): PresetDefinition {
  if (name === "ink") return wanderingInkPreset;
  if (name === "tide" || name === "archive") return tideArchivePreset;
  if (name === "membrane") return breathingMembranePreset;
  return crumpledPaperPreset;
}

// Authored personalities for the wandering ink: same rules, different
// bodies. ?mode=serpent (long, slow, thin) or ?mode=hatchling (short,
// quick, skittish); the default is the loner.
const mode = urlParameters.get("mode");
function applyInkMode(preset: PresetDefinition): void {
  if (preset.id !== "wandering-ink" || !preset.config.creature) return;
  const creature = preset.config.creature;
  if (mode === "serpent") {
    creature.trailCount = 340;
    creature.baseSpeedRatio = 0.068;
    creature.inkWidthRatio = 0.0042;
    creature.wanderStrength = 1.3;
  } else if (mode === "hatchling") {
    creature.trailCount = 70;
    creature.baseSpeedRatio = 0.125;
    creature.inkWidthRatio = 0.0062;
    creature.pointerRepelRadiusRatio = 0.3;
    creature.pointerSpeedBoost = 1.6;
  }
}
function createRendererFor(
  presetId: string,
): ReturnType<typeof createCanvasRenderer> {
  if (presetId === "tide-archive") {
    return createContourRenderer(canvas!);
  }

  if (presetId === "wandering-ink") {
    return createInkRenderer(canvas!);
  }

  if (presetId === "breathing-membrane") {
    try {
      return createWebglMembraneRenderer(canvas!);
    } catch (error) {
      console.error(
        "WebGL membrane renderer unavailable, falling back:",
        error,
      );

      // A canvas that has handed out a WebGL context cannot reliably
      // provide a 2D one afterwards, so swap in a fresh canvas first.
      const replacement =
        canvas!.cloneNode(false) as HTMLCanvasElement;

      canvas!.replaceWith(replacement);
      canvas = replacement;

      return createCanvasRenderer(replacement);
    }
  }

  if (presetId !== "crumpled-paper") {
    return createCanvasRenderer(canvas!);
  }

  try {
    return createWebglPaperRenderer(canvas!);
  } catch (error) {
    console.error(
      "WebGL paper renderer unavailable, falling back:",
      error,
    );

    const replacement =
      canvas!.cloneNode(false) as HTMLCanvasElement;

    canvas!.replaceWith(replacement);
    canvas = replacement;

    return createPaperRenderer(replacement);
  }
}
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

  const preset: PresetDefinition = {
    ...definition,
    config: structuredClone(definition.config),
  };
  applyInkMode(preset);

  const renderer = createRendererFor(preset.id);
  const engine = createEngine(preset, renderer, getViewport());
  const unbindPointer = bindPointerInput(canvas!, engine.getState);
  const removeLivelyBridge = installLivelyBridge(preset.config, {
    rebuildTopology: engine.rebuildTopology,
    refreshRenderer: () => engine.resize(getViewport()),
    selectPreset: startPreset,
  });

  runtime = { presetId: preset.id, engine, unbindPointer, removeLivelyBridge };
  // Debug handles for tuning sessions; harmless in production wallpapers.
  (window as unknown as { __engine: typeof engine }).__engine = engine;
  (window as unknown as { __config: typeof preset.config }).__config = preset.config;
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
