import type { PresetDefinition, Renderer } from "./contracts";
import { createEmptySimulationState } from "./state";
import type { SimulationState } from "./state";
import type { Viewport } from "./types";

export interface FoldedLatticeEngine {
  start(): void;
  stop(): void;
  resize(viewport: Viewport): void;
  rebuildTopology(): void;
  getState(): Readonly<SimulationState>;
  dispose(): void;
}

export function createEngine(
  preset: PresetDefinition,
  renderer: Renderer,
  initialViewport: Viewport,
): FoldedLatticeEngine {
  const config = preset.config;
  const state = createEmptySimulationState(initialViewport);
  state.time.fixedDelta = 1 / config.performance.fixedSimulationFps;
  state.topology = preset.topologyBuilder.build(initialViewport, config);
  renderer.resize(initialViewport, config.performance.maximumDevicePixelRatio);

  let animationFrameId = 0;
  let running = false;
  let lastTimestamp = 0;
  let lastFrameTimestamp = 0;
  let accumulator = 0;

  const rebuildTopology = (): void => {
    state.topology = preset.topologyBuilder.build(state.viewport, config);
    state.fields = [];
    accumulator = 0;
  };

  const fixedUpdate = (deltaSeconds: number): void => {
    for (const system of preset.simulationSystems) {
      system.update(state, config, deltaSeconds);
    }
  };

  const frameUpdate = (deltaSeconds: number): void => {
    for (const system of preset.frameSystems) {
      system.updateFrame(state, config, deltaSeconds);
    }
  };

  const frame = (timestampMs: number): void => {
    if (!running) return;

    const minimumFrameTime = 1000 / Math.max(1, config.performance.targetFps);
    if (
      config.performance.targetFps < 58 &&
      timestampMs - lastFrameTimestamp < minimumFrameTime * 0.9
    ) {
      animationFrameId = requestAnimationFrame(frame);
      return;
    }
    lastFrameTimestamp = timestampMs;

    if (lastTimestamp === 0) lastTimestamp = timestampMs;
    const frameDelta = Math.min(Math.max((timestampMs - lastTimestamp) / 1000, 0), 0.05);
    lastTimestamp = timestampMs;
    state.time.delta = frameDelta;
    state.time.elapsed += frameDelta;
    state.time.frame += 1;
    accumulator += frameDelta;

    let subSteps = 0;
    while (
      accumulator >= state.time.fixedDelta &&
      subSteps < config.performance.maximumSubSteps
    ) {
      fixedUpdate(state.time.fixedDelta);
      accumulator -= state.time.fixedDelta;
      subSteps += 1;
    }
    if (subSteps >= config.performance.maximumSubSteps) accumulator = 0;

    frameUpdate(frameDelta);
    renderer.render(state, config);
    animationFrameId = requestAnimationFrame(frame);
  };

  return {
    start() {
      if (running) return;
      running = true;
      lastTimestamp = 0;
      lastFrameTimestamp = 0;
      animationFrameId = requestAnimationFrame(frame);
    },

    stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(animationFrameId);
    },

    resize(viewport) {
      state.viewport = viewport;
      renderer.resize(viewport, config.performance.maximumDevicePixelRatio);
      rebuildTopology();
    },

    rebuildTopology,

    getState() {
      return state;
    },

    dispose() {
      running = false;
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
    },
  };
}
