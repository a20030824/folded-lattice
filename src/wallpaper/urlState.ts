export interface WallpaperUrlState {
  preset: string | null;
  mode: string | null;
}

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

export function bindWallpaperUrlState(
  onChange: (state: WallpaperUrlState) => void,
): () => void {
  let active = true;
  const history = window.history;
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  const emit = (): void => {
    if (active) onChange(readWallpaperUrlState());
  };

  const pushState: History["pushState"] = function (data, unused, url) {
    originalPushState.call(history, data, unused, url);
    emit();
  };
  const replaceState: History["replaceState"] = function (data, unused, url) {
    originalReplaceState.call(history, data, unused, url);
    emit();
  };

  history.pushState = pushState;
  history.replaceState = replaceState;
  window.addEventListener("popstate", emit);

  return () => {
    if (!active) return;
    active = false;
    window.removeEventListener("popstate", emit);
    if (history.pushState === pushState) history.pushState = originalPushState;
    if (history.replaceState === replaceState) {
      history.replaceState = originalReplaceState;
    }
  };
}
