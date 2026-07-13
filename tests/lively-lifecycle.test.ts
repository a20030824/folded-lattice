import { afterEach, describe, expect, it, vi } from "vitest";
import type { Renderer } from "../src/core/contracts";
import { createEngine } from "../src/core/createEngine";
import { requireMembranePulseRuntime } from "../src/features/membrane/state";
import { resolvePreset } from "../src/presets/registry";

const viewport = { width: 320, height: 240, devicePixelRatio: 1 };

function createRendererMock(): Renderer & {
  resize: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  return {
    resize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Lively lifecycle regressions", () => {
  it("refreshes renderer quality without rebuilding topology or resources", () => {
    const preset = resolvePreset("membrane");
    const config = preset.createConfig();
    const renderer = createRendererMock();
    const engine = createEngine(preset, config, renderer, viewport);
    const state = engine.getState();
    const topology = state.topology;
    const pulseRuntime = requireMembranePulseRuntime(state);

    config.performance.maximumDevicePixelRatio = 2.5;
    engine.refreshRenderer();

    expect(renderer.resize).toHaveBeenLastCalledWith(viewport, 2.5);
    expect(engine.getState().topology).toBe(topology);
    expect(requireMembranePulseRuntime(engine.getState())).toBe(pulseRuntime);

    engine.dispose();
  });

  it("does not trigger membrane wave or pulse effects while pointer interaction is disabled", () => {
    const preset = resolvePreset("membrane");
    const config = preset.createConfig();
    config.fields.pointer.enabled = false;
    const renderer = createRendererMock();
    const engine = createEngine(preset, config, renderer, viewport);
    const state = engine.getState();

    state.pointer.isInside = true;
    state.pointer.isDown = true;
    state.pointer.position.x = viewport.width * 0.5;
    state.pointer.position.y = viewport.height * 0.5;

    const waveSystem = preset.simulationSystems.find(
      (system) => system.name === "membrane-wave",
    );
    const pulseSystem = preset.simulationSystems.find(
      (system) => system.name === "membrane-pulse",
    );
    expect(waveSystem).toBeDefined();
    expect(pulseSystem).toBeDefined();

    waveSystem!.update(state, config, 1 / 60);
    pulseSystem!.update(state, config, 1 / 60);

    expect(state.topology.nodes.every((node) => node.force.z === 0)).toBe(true);
    expect(
      Array.from(requireMembranePulseRuntime(state).edgePulse).every(
        (value) => value === 0,
      ),
    ).toBe(true);

    engine.dispose();
  });

  it("keeps one RAF loop and prevents a disposed callback from rescheduling", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    const requestFrame = vi.fn((callback: FrameRequestCallback): number => {
      const id = nextFrameId;
      nextFrameId += 1;
      callbacks.set(id, callback);
      return id;
    });
    const cancelFrame = vi.fn((id: number): void => {
      callbacks.delete(id);
    });
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);

    const preset = resolvePreset("paper");
    const config = preset.createConfig();
    const renderer = createRendererMock();
    const engine = createEngine(preset, config, renderer, viewport);

    engine.start();
    engine.start();
    expect(requestFrame).toHaveBeenCalledTimes(1);

    const firstFrame = callbacks.get(1);
    expect(firstFrame).toBeDefined();
    callbacks.delete(1);
    firstFrame!(16);

    expect(requestFrame).toHaveBeenCalledTimes(2);
    expect(engine.getState().time.frame).toBe(1);
    const staleFrame = callbacks.get(2);
    expect(staleFrame).toBeDefined();

    engine.dispose();
    expect(cancelFrame).toHaveBeenCalledWith(2);
    expect(callbacks.size).toBe(0);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);

    staleFrame!(32);
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });
});
