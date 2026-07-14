import { afterEach, describe, expect, it, vi } from "vitest";
import { installLivelyBridge } from "../src/wallpaper/lively";

function createControls() {
  return {
    rebuildTopology: vi.fn(),
    refreshRenderer: vi.fn(),
    selectPreset: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Lively bridge lifecycle", () => {
  it("restores the previous active bridge and skips bridges already disposed", () => {
    const externalListener = vi.fn();
    const fakeWindow = {
      livelyPropertyListener: externalListener,
      clearTimeout: vi.fn(),
      setTimeout: vi.fn(() => 1),
    } as unknown as Window & typeof globalThis;
    vi.stubGlobal("window", fakeWindow);

    const originalControls = createControls();
    const removeOriginal = installLivelyBridge([], originalControls);
    const originalListener = window.livelyPropertyListener;

    const stagedControls = createControls();
    const removeStaged = installLivelyBridge([], stagedControls);
    expect(window.livelyPropertyListener).not.toBe(originalListener);

    removeStaged();
    expect(window.livelyPropertyListener).toBe(originalListener);
    window.livelyPropertyListener?.("preset", 1);
    expect(originalControls.selectPreset).toHaveBeenCalledWith("ink");

    const committedControls = createControls();
    const removeCommitted = installLivelyBridge([], committedControls);
    const committedListener = window.livelyPropertyListener;

    removeOriginal();
    expect(window.livelyPropertyListener).toBe(committedListener);

    removeCommitted();
    expect(window.livelyPropertyListener).toBe(externalListener);
  });
});
