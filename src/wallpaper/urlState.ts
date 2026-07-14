export interface WallpaperUrlState {
  preset: string | null;
  mode: string | null;
}

type UrlStateListener = (state: WallpaperUrlState) => void;

const listeners = new Set<UrlStateListener>();
let removeHistoryObservation: (() => void) | null = null;

function normalizeOptionalParameter(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

export function readWallpaperUrlState(
  search = window.location.search,
): WallpaperUrlState {
  const parameters = new URLSearchParams(search);
  return {
    preset: normalizeOptionalParameter(parameters.get("preset")),
    mode: normalizeOptionalParameter(parameters.get("mode")),
  };
}

function emitWallpaperUrlState(): void {
  const state = readWallpaperUrlState();
  for (const listener of [...listeners]) listener(state);
}

function installHistoryObservation(): () => void {
  const observedWindow = window;
  const history = observedWindow.history;
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  const pushState: History["pushState"] = function (data, unused, url) {
    originalPushState.call(history, data, unused, url);
    emitWallpaperUrlState();
  };
  const replaceState: History["replaceState"] = function (data, unused, url) {
    originalReplaceState.call(history, data, unused, url);
    emitWallpaperUrlState();
  };
  const onPopState = (): void => emitWallpaperUrlState();

  history.pushState = pushState;
  history.replaceState = replaceState;
  observedWindow.addEventListener("popstate", onPopState);

  return () => {
    observedWindow.removeEventListener("popstate", onPopState);
    if (history.pushState === pushState) history.pushState = originalPushState;
    if (history.replaceState === replaceState) {
      history.replaceState = originalReplaceState;
    }
  };
}

export function bindWallpaperUrlState(onChange: UrlStateListener): () => void {
  listeners.add(onChange);
  if (!removeHistoryObservation) {
    removeHistoryObservation = installHistoryObservation();
  }

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    listeners.delete(onChange);
    if (listeners.size > 0 || !removeHistoryObservation) return;

    removeHistoryObservation();
    removeHistoryObservation = null;
  };
}
