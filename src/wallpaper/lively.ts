import { asNumber } from "../core/propertyBindings";
import type {
  PropertyBinding,
  PropertyBindingContext,
} from "../core/propertyBindings";
import { livelyPresetNames } from "../presets/registry";

declare global {
  interface Window {
    livelyPropertyListener?: (name: string, value: unknown) => void;
  }
}

interface LivelyBridgeControls {
  presetId: string;
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

export type LivelyPropertyValues = Map<string, unknown>;

export function createLivelyPropertyValues(): LivelyPropertyValues {
  return new Map<string, unknown>();
}

let currentBridge: LivelyBridgeEntry | null = null;

function presetNameFromValue(value: unknown): string {
  const index = Math.max(
    0,
    Math.min(livelyPresetNames.length - 1, Math.round(asNumber(value, 0))),
  );
  return livelyPresetNames[index]!;
}

export function installLivelyBridge(
  bindings: PropertyBinding[],
  controls: LivelyBridgeControls,
  propertyValues: LivelyPropertyValues = createLivelyPropertyValues(),
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
  const unsupportedProperties = new Set<string>();

  const applyProperty = (name: string, value: unknown): void => {
    const binding = bindingMap.get(name);
    if (binding) {
      binding.apply(value, context);
      return;
    }

    if (unsupportedProperties.has(name)) return;
    unsupportedProperties.add(name);
    console.warn(
      `Lively property "${name}" is not supported by preset "${controls.presetId}". ` +
        "The value was saved and will be applied when a supporting preset is selected.",
    );
  };

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

      propertyValues.set(name, value);
      applyProperty(name, value);
    },
  };

  currentBridge = entry;
  window.livelyPropertyListener = entry.listener;

  // Reapply values already received from Lively to a newly staged preset. Only
  // bindings supported by this preset are replayed; unsupported values remain
  // stored for a later preset without producing repeated warnings.
  for (const [name, binding] of bindingMap) {
    if (!propertyValues.has(name)) continue;
    binding.apply(propertyValues.get(name), context);
  }

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
