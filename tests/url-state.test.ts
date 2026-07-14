import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bindWallpaperUrlState,
  readWallpaperUrlState,
  type WallpaperUrlState,
} from "../src/wallpaper/urlState";

interface FakeWindow extends EventTarget {
  history: History;
  location: { search: string };
}

function createFakeWindow(initialSearch = ""): FakeWindow {
  const target = new EventTarget() as FakeWindow;
  const location = { search: initialSearch };

  const updateSearch = (url?: string | URL | null): void => {
    if (url === undefined || url === null) return;
    location.search = new URL(String(url), "https://example.test/").search;
  };

  target.location = location;
  target.history = {
    pushState: vi.fn((_data: unknown, _unused: string, url?: string | URL | null) => {
      updateSearch(url);
    }),
    replaceState: vi.fn(
      (_data: unknown, _unused: string, url?: string | URL | null) => {
        updateSearch(url);
      },
    ),
  } as unknown as History;
  return target;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("wallpaper URL state", () => {
  it("normalizes optional preset and mode values", () => {
    expect(readWallpaperUrlState("?preset=%20ink%20&mode=%20serpent%20")).toEqual({
      preset: "ink",
      mode: "serpent",
    });
    expect(readWallpaperUrlState("?preset=&mode=%20%20")).toEqual({
      preset: null,
      mode: null,
    });
  });

  it("emits after pushState, replaceState, and popstate", () => {
    const fakeWindow = createFakeWindow("?preset=paper");
    vi.stubGlobal("window", fakeWindow);
    const originalPushState = fakeWindow.history.pushState;
    const originalReplaceState = fakeWindow.history.replaceState;
    const states: WallpaperUrlState[] = [];

    const remove = bindWallpaperUrlState((state) => states.push(state));

    fakeWindow.history.pushState({}, "", "?preset=ink&mode=serpent");
    fakeWindow.history.replaceState({}, "", "?preset=membrane");
    fakeWindow.location.search = "?preset=tide&mode=hatchling";
    fakeWindow.dispatchEvent(new Event("popstate"));

    expect(states).toEqual([
      { preset: "ink", mode: "serpent" },
      { preset: "membrane", mode: null },
      { preset: "tide", mode: "hatchling" },
    ]);

    remove();
    expect(fakeWindow.history.pushState).toBe(originalPushState);
    expect(fakeWindow.history.replaceState).toBe(originalReplaceState);

    fakeWindow.history.pushState({}, "", "?preset=paper");
    fakeWindow.dispatchEvent(new Event("popstate"));
    expect(states).toHaveLength(3);
  });

  it("does not overwrite a newer History API wrapper during cleanup", () => {
    const fakeWindow = createFakeWindow();
    vi.stubGlobal("window", fakeWindow);

    const removeFirst = bindWallpaperUrlState(() => undefined);
    const removeSecond = bindWallpaperUrlState(() => undefined);
    const secondPushState = fakeWindow.history.pushState;

    removeFirst();
    expect(fakeWindow.history.pushState).toBe(secondPushState);

    removeSecond();
  });
});
