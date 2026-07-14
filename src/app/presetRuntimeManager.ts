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
import { readWallpaperUrlState } from "../wallpaper/urlState";
import {
  bindWebglContextRecovery,
  createWebglFallbackPolicy,
} from "../wallpaper/webglContextRecovery";
import { createRendererWithWebglCleanup } from "../wallpaper/webglInitialization";

export interface PresetRuntimeSnapshot {
  canvas: HTMLCanvasElement;
  config: FoldedLatticeConfig;
  engine: FoldedLatticeEngine;
  mode: string | null;
  presetId: string;
}

export interface StartPresetOptions {
  forceRestart?: boolean;
  forceCanvasFallback?: boolean;
  mode?: string | null;
}

interface ActiveRuntime extends PresetRuntimeSnapshot {
  removeLivelyBridge(): void;
  removeWebglContextRecovery(): void;
  unbindPointer(): void;
}

interface StagedPreset {
  canvas: HTMLCanvasElement;
  runtime: ActiveRuntime;
}

interface PresetRuntimeManagerServices {
  bindPointerInput: typeof bindPointerInput;
  bindWebglContextRecovery: typeof bindWebglContextRecovery;
  createEngine: typeof createEngine;
  createPresetColorGradingBindings: typeof createPresetColorGradingBindings;
  createRendererWithWebglCleanup: typeof createRendererWithWebglCleanup;
  installLivelyBridge: typeof installLivelyBridge;
  resolvePreset: typeof resolvePreset;
  shouldForceCanvasFallback(): boolean;
}

export interface CreatePresetRuntimeManagerOptions {
  canvas: HTMLCanvasElement;
  getViewport(): Viewport;
  isHidden(): boolean;
  getCurrentMode?(): string | null;
  onCommit?(snapshot: PresetRuntimeSnapshot): void;
  onError?(message: string, error: unknown): void;
  onWarning?(message: string): void;
  services?: Partial<PresetRuntimeManagerServices>;
}

export interface PresetRuntimeManager {
  dispose(): void;
  getActiveRuntime(): PresetRuntimeSnapshot | null;
  resize(viewport?: Viewport): void;
  setVisible(visible: boolean): void;
  startPreset(name: string | null, options?: StartPresetOptions): boolean;
  syncUrlState(state: { preset: string | null; mode: string | null }): boolean;
}

export function createPresetRuntimeManager(
  options: CreatePresetRuntimeManagerOptions,
): PresetRuntimeManager {
  const overrides = options.services;
  const services: PresetRuntimeManagerServices = {
    bindPointerInput: overrides?.bindPointerInput ?? bindPointerInput,
    bindWebglContextRecovery:
      overrides?.bindWebglContextRecovery ?? bindWebglContextRecovery,
    createEngine: overrides?.createEngine ?? createEngine,
    createPresetColorGradingBindings:
      overrides?.createPresetColorGradingBindings ??
      createPresetColorGradingBindings,
    createRendererWithWebglCleanup:
      overrides?.createRendererWithWebglCleanup ??
      createRendererWithWebglCleanup,
    installLivelyBridge: overrides?.installLivelyBridge ?? installLivelyBridge,
    resolvePreset: overrides?.resolvePreset ?? resolvePreset,
    shouldForceCanvasFallback:
      overrides?.shouldForceCanvasFallback ?? createWebglFallbackPolicy(),
  };
  const livelyPropertyValues = createLivelyPropertyValues();
  const getCurrentMode =
    options.getCurrentMode ?? (() => readWallpaperUrlState().mode);
  const reportError =
    options.onError ??
    ((message: string, error: unknown) => console.error(message, error));
  const reportWarning =
    options.onWarning ?? ((message: string) => console.warn(message));

  let canvas = options.canvas;
  let runtime: ActiveRuntime | null = null;
  let disposed = false;

  const runCleanup = (label: string, cleanup: () => void): void => {
    try {
      cleanup();
    } catch (error) {
      reportError(`Failed to ${label}:`, error);
    }
  };

  const disposeRuntime = (target: ActiveRuntime): void => {
    runCleanup(
      "remove preset WebGL context recovery",
      target.removeWebglContextRecovery,
    );
    runCleanup("unbind preset pointer input", target.unbindPointer);
    runCleanup("remove preset Lively bridge", target.removeLivelyBridge);
    runCleanup("dispose preset engine", target.engine.dispose);
  };

  const getActiveRuntime = (): PresetRuntimeSnapshot | null => {
    if (!runtime) return null;
    return {
      canvas: runtime.canvas,
      config: runtime.config,
      engine: runtime.engine,
      mode: runtime.mode,
      presetId: runtime.presetId,
    };
  };

  const startPreset = (
    name: string | null,
    startOptions: StartPresetOptions = {},
  ): boolean => {
    if (disposed) return false;

    const definition = services.resolvePreset(name);
    const requestedMode =
      startOptions.mode === undefined ? getCurrentMode() : startOptions.mode;
    const mode = definition.applyMode ? requestedMode : null;
    if (
      !startOptions.forceRestart &&
      runtime?.presetId === definition.id &&
      runtime.mode === mode
    ) {
      return false;
    }

    const previousRuntime = runtime;
    const previousCanvas = canvas;
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
      if (unbindPointer) {
        runCleanup("unbind staged pointer input", unbindPointer);
      }
      if (candidateEngine) {
        runCleanup("dispose staged engine", candidateEngine.dispose);
      } else if (candidateRenderer) {
        runCleanup("dispose staged renderer", candidateRenderer.dispose);
      }
    };

    try {
      const config = definition.createConfig();
      definition.applyMode?.(config, mode);

      const rendererResult = services.createRendererWithWebglCleanup(
        stagingCanvas,
        () => definition.createRenderer(stagingCanvas, config),
        { disableWebgl: startOptions.forceCanvasFallback ?? false },
      );
      candidateRenderer = rendererResult.renderer;

      const engine = services.createEngine(
        definition,
        config,
        candidateRenderer,
        options.getViewport(),
      );
      candidateEngine = engine;
      unbindPointer = services.bindPointerInput(
        rendererResult.canvas,
        engine.getState,
      );
      const propertyBindings = [
        ...definition.createPropertyBindings(config),
        ...services.createPresetColorGradingBindings(definition.id, config),
      ];
      removeLivelyBridge = services.installLivelyBridge(
        propertyBindings,
        {
          presetId: definition.id,
          rebuildTopology: engine.rebuildTopology,
          refreshRenderer: engine.refreshRenderer,
          selectPreset: (selectedPreset) => startPreset(selectedPreset),
        },
        livelyPropertyValues,
      );

      const activeCanvas = rendererResult.canvas;
      removeWebglContextRecovery = services.bindWebglContextRecovery(
        activeCanvas,
        () => {
          if (disposed || canvas !== activeCanvas || runtime?.engine !== engine) {
            return;
          }
          const useCanvasFallback = services.shouldForceCanvasFallback();
          reportWarning(
            useCanvasFallback
              ? `WebGL context repeatedly lost for preset "${definition.id}"; using Canvas fallback.`
              : `WebGL context lost for preset "${definition.id}"; restarting the renderer.`,
          );
          startPreset(definition.id, {
            forceRestart: true,
            forceCanvasFallback: useCanvasFallback,
            mode,
          });
        },
      );

      if (!options.isHidden()) engine.start();

      staged = {
        canvas: activeCanvas,
        runtime: {
          canvas: activeCanvas,
          config,
          engine,
          mode,
          presetId: definition.id,
          removeLivelyBridge,
          removeWebglContextRecovery,
          unbindPointer,
        },
      };
    } catch (error) {
      discardCandidate();
      reportError(`Failed to stage preset "${definition.id}":`, error);
      return false;
    }

    if (!staged) return false;

    try {
      previousCanvas.replaceWith(staged.canvas);
    } catch (error) {
      discardCandidate();
      reportError(`Failed to commit preset "${definition.id}":`, error);
      return false;
    }

    canvas = staged.canvas;
    runtime = staged.runtime;

    if (options.onCommit) {
      try {
        options.onCommit(getActiveRuntime()!);
      } catch (error) {
        reportError(`Failed to publish preset "${definition.id}" runtime:`, error);
      }
    }

    if (previousRuntime) disposeRuntime(previousRuntime);
    return true;
  };

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      if (runtime) disposeRuntime(runtime);
      runtime = null;
    },

    getActiveRuntime,

    resize(viewport = options.getViewport()) {
      if (!disposed) runtime?.engine.resize(viewport);
    },

    setVisible(visible) {
      if (disposed || !runtime) return;
      if (visible) runtime.engine.start();
      else runtime.engine.stop();
    },

    startPreset,

    syncUrlState(state) {
      return startPreset(state.preset, { mode: state.mode });
    },
  };
}
