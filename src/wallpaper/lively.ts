import { asNumber } from "../core/propertyBindings";
import type {
  PropertyBinding,
  PropertyBindingContext,
} from "../core/propertyBindings";

declare global {
  interface Window {
    livelyPropertyListener?: (name: string, value: unknown) => void;
  }
}

interface LivelyBridgeControls {
  rebuildTopology(): void;
  refreshRenderer(): void;
  selectPreset(name: string): void;
}

interface LivelyBridgeEntry {
  active: boolean;
  listener(name: string, value: unknown): void;
  previous: LivelyBridgeEntry | null;
  fallbackListener: Window["livelyPropertyListener"];
}

let currentBridge: LivelyBridgeEntry | null = null;

const presetNames = ["paper", "ink", "membrane", "tide"] as const;
function presetNameFromValue(value: unknown): string {
  const index = Math.max(
    0,
    Math.min(presetNames.length - 1, Math.round(asNumber(value, 0))),
  );
  return presetNames[index]!;
}

export function installLivelyBridge(
  bindings: PropertyBinding[],
  controls: LivelyBridgeControls,
): () => void {
  let rebuildTimer = 0;

  const scheduleTopologyRebuild = (): void => {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(controls.rebuildTopology, 120);
  };

  const context: PropertyBindingContext = {
    rebuildTopology: controls.rebuildTopology,
    scheduleTopologyRebuild,
    refreshRenderer: controls.refreshRenderer,
  };
  const bindingMap = new Map(
    bindings.map((binding) => [binding.name, binding]),
  );
  const previous = currentBridge;
  const entry: LivelyBridgeEntry = {
    active: true,
    previous,
    fallbackListener: previous
      ? previous.fallbackListener
      : window.livelyPropertyListener,
    listener(name, value) {
      if (name === "preset") {
        controls.selectPreset(presetNameFromValue(value));
        return;
      }

      bindingMap.get(name)?.apply(value, context);
    },
  };

  currentBridge = entry;
  window.livelyPropertyListener = entry.listener;

  return () => {
    window.clearTimeout(rebuildTimer);
    if (!entry.active) return;
    entry.active = false;
    if (currentBridge !== entry) return;

    let previousActive = entry.previous;
    while (previousActive && !previousActive.active) {
      previousActive = previousActive.previous;
    }
    currentBridge = previousActive;

    if (window.livelyPropertyListener !== entry.listener) return;
    if (previousActive) {
      window.livelyPropertyListener = previousActive.listener;
    } else if (entry.fallbackListener) {
      window.livelyPropertyListener = entry.fallbackListener;
    } else {
      delete window.livelyPropertyListener;
    }
  };
}
