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
  const previousListener = window.livelyPropertyListener;
  const listener = (name: string, value: unknown): void => {
    if (name === "preset") {
      controls.selectPreset(presetNameFromValue(value));
      return;
    }

    bindingMap.get(name)?.apply(value, context);
  };

  window.livelyPropertyListener = listener;

  return () => {
    window.clearTimeout(rebuildTimer);
    if (window.livelyPropertyListener !== listener) return;

    if (previousListener) window.livelyPropertyListener = previousListener;
    else delete window.livelyPropertyListener;
  };
}
