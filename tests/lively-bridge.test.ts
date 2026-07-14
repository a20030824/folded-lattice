import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLivelyPropertyValues,
  installLivelyBridge,
} from "../src/wallpaper/lively";

function createControls(presetId = "test-preset") {
  return {
    presetId,
    rebuildTopology: vi.fn(),
    refreshRenderer: vi.fn(),
    selectPreset: vi.fn(),
  };
}

function stubWindow(listener?: (name: string, value: unknown) => void): void {
  const fakeWindow = {
    livelyPropertyListener: listener,
    clearTimeout: vi.fn(),
    setTimeout: vi.fn(() => 1),
  } as unknown as Window & typeof globalThis;
  vi.stubGlobal("window", fakeWindow);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Lively bridge lifecycle", () => {
  it("restores the previous active bridge and skips bridges already disposed", () => {
    const externalListener = vi.fn();
    stubWindow(externalListener);

    const originalControls = createControls("paper");
    const removeOriginal = installLivelyBridge([], originalControls);
    const originalListener = window.livelyPropertyListener;

    const stagedControls = createControls("ink");
    const removeStaged = installLivelyBridge([], stagedControls);
    expect(window.livelyPropertyListener).not.toBe(originalListener);

    removeStaged();
    expect(window.livelyPropertyListener).toBe(originalListener);
    window.livelyPropertyListener?.("preset", 1);
    expect(originalControls.selectPreset).toHaveBeenCalledWith("ink");

    const committedControls = createControls("membrane");
    const removeCommitted = installLivelyBridge([], committedControls);
    const committedListener = window.livelyPropertyListener;

    removeOriginal();
    expect(window.livelyPropertyListener).toBe(committedListener);

    removeCommitted();
    expect(window.livelyPropertyListener).toBe(externalListener);
  });

  it("removes the listener when every bridge is disposed and no fallback exists", () => {
    stubWindow();

    const removeOriginal = installLivelyBridge([], createControls("paper"));
    const removeCommitted = installLivelyBridge([], createControls("ink"));

    removeOriginal();
    removeCommitted();

    expect(window.livelyPropertyListener).toBeUndefined();
  });

  it("replays stored values into bindings on a newly staged preset", () => {
    stubWindow();
    const propertyValues = createLivelyPropertyValues();
    const paperApply = vi.fn();
    const membraneApply = vi.fn();

    const removePaper = installLivelyBridge(
      [{ name: "brightness", apply: paperApply }],
      createControls("crumpled-paper"),
      propertyValues,
    );
    window.livelyPropertyListener?.("brightness", 135);
    expect(paperApply).toHaveBeenCalledWith(135, expect.any(Object));

    const removeMembrane = installLivelyBridge(
      [{ name: "brightness", apply: membraneApply }],
      createControls("breathing-membrane"),
      propertyValues,
    );
    expect(membraneApply).toHaveBeenCalledTimes(1);
    expect(membraneApply).toHaveBeenCalledWith(135, expect.any(Object));

    removePaper();
    removeMembrane();
  });

  it("stores unsupported values and warns only once per active preset", () => {
    stubWindow();
    const propertyValues = createLivelyPropertyValues();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const removeBridge = installLivelyBridge(
      [],
      createControls("wandering-ink"),
      propertyValues,
    );

    window.livelyPropertyListener?.("pressureStrength", 120);
    window.livelyPropertyListener?.("pressureStrength", 140);

    expect(propertyValues.get("pressureStrength")).toBe(140);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('not supported by preset "wandering-ink"'),
    );

    removeBridge();
  });
});
