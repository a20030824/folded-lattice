import { afterEach, describe, expect, it, vi } from "vitest";
import { bindWebglContextRecovery } from "../src/wallpaper/webglContextRecovery";

interface ScheduledCallback {
  callback: () => void;
  id: number;
}

function stubWindow(): ScheduledCallback[] {
  const scheduled: ScheduledCallback[] = [];
  let nextId = 1;
  vi.stubGlobal("window", {
    setTimeout(callback: () => void) {
      const id = nextId;
      nextId += 1;
      scheduled.push({ callback, id });
      return id;
    },
    clearTimeout: vi.fn(),
  });
  return scheduled;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("WebGL context recovery", () => {
  it("prevents permanent loss and coalesces repeated events", () => {
    const scheduled = stubWindow();
    const canvas = new EventTarget() as unknown as HTMLCanvasElement;
    const recover = vi.fn();
    const remove = bindWebglContextRecovery(canvas, recover);

    const first = new Event("webglcontextlost", { cancelable: true });
    const second = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(first);
    canvas.dispatchEvent(second);

    expect(first.defaultPrevented).toBe(true);
    expect(second.defaultPrevented).toBe(true);
    expect(scheduled).toHaveLength(1);
    expect(recover).not.toHaveBeenCalled();

    scheduled[0]!.callback();
    expect(recover).toHaveBeenCalledTimes(1);

    remove();
  });

  it("cancels a pending recovery when the runtime is disposed", () => {
    const scheduled = stubWindow();
    const canvas = new EventTarget() as unknown as HTMLCanvasElement;
    const recover = vi.fn();
    const remove = bindWebglContextRecovery(canvas, recover);

    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    remove();

    expect(window.clearTimeout).toHaveBeenCalledWith(scheduled[0]!.id);
    scheduled[0]!.callback();
    expect(recover).not.toHaveBeenCalled();
  });
});
