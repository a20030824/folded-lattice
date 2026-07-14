import "./styles.css";

import type { FoldedLatticeConfig } from "../core/config";
import type { FoldedLatticeEngine } from "../core/createEngine";
import type { Viewport } from "../core/types";
import {
  bindWallpaperUrlState,
  readWallpaperUrlState,
} from "../wallpaper/urlState";
import { createPresetRuntimeManager } from "./presetRuntimeManager";

const canvas = document.querySelector<HTMLCanvasElement>("#wallpaper");
if (!canvas) throw new Error('Canvas element "#wallpaper" was not found.');

const getViewport = (): Viewport => ({
  width: Math.max(1, window.innerWidth),
  height: Math.max(1, window.innerHeight),
  devicePixelRatio: window.devicePixelRatio || 1,
});

const manager = createPresetRuntimeManager({
  canvas,
  getViewport,
  isHidden: () => document.hidden,
  onCommit(snapshot) {
    // Debug handles for tuning sessions; harmless in production wallpapers.
    const debugWindow = window as unknown as {
      __config: FoldedLatticeConfig;
      __engine: FoldedLatticeEngine;
      __mode: string | null;
      __presetId: string;
    };
    debugWindow.__engine = snapshot.engine;
    debugWindow.__config = snapshot.config;
    debugWindow.__presetId = snapshot.presetId;
    debugWindow.__mode = snapshot.mode;
  },
});

let resizeTimer = 0;
const onResize = (): void => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => manager.resize(), 150);
};
const onVisibilityChange = (): void => {
  manager.setVisible(!document.hidden);
};

const removeUrlStateBinding = bindWallpaperUrlState((state) => {
  manager.syncUrlState(state);
});

const dispose = (): void => {
  window.clearTimeout(resizeTimer);
  window.removeEventListener("resize", onResize);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  removeUrlStateBinding();
  manager.dispose();
};

window.addEventListener("resize", onResize);
window.addEventListener("beforeunload", dispose, { once: true });
document.addEventListener("visibilitychange", onVisibilityChange);
manager.syncUrlState(readWallpaperUrlState());
