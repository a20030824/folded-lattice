import type { FoldedLatticeConfig } from "../core/config";

declare global {
  interface Window {
    livelyPropertyListener?: (name: string, value: unknown) => void;
  }
}

interface LivelyBridgeControls {
  rebuildTopology(): void;
  refreshRenderer(): void;
}

function asNumber(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const presetQueries = ["", "ink", "membrane", "tide"] as const;

function selectPreset(value: unknown): void {
  const index = Math.max(
    0,
    Math.min(presetQueries.length - 1, Math.round(asNumber(value, 0))),
  );
  const target = presetQueries[index]!;
  const parameters = new URLSearchParams(window.location.search);
  const current = parameters.get("preset") ?? "";
  if (current === target || (target === "" && current === "paper")) return;

  if (target) parameters.set("preset", target);
  else parameters.delete("preset");
  window.location.search = parameters.toString();
}

export function installLivelyBridge(
  config: FoldedLatticeConfig,
  controls: LivelyBridgeControls,
): () => void {
  let rebuildTimer = 0;
  // Every preset defines its own visual baseline. Lively sliders scale that
  // baseline instead of silently snapping alternate works back to V1 values.
  const defaults = {
    nodeCount: config.topology.nodeCount,
    edgeOpacity: config.render.edgeOpacity,
    triangleOpacity: config.render.triangleOpacity,
    pressureMinimumStrength: config.fields.pressure.minimumStrength,
    pressureMaximumStrength: config.fields.pressure.maximumStrength,
    pressureMinimumRadius: config.fields.pressure.minimumRadiusRatio,
    pressureMaximumRadius: config.fields.pressure.maximumRadiusRatio,
    pressureMinimumSpeed: config.fields.pressure.minimumSpeed,
    pressureMaximumSpeed: config.fields.pressure.maximumSpeed,
    ambientSpeed: config.fields.ambient.speed,
    edgeRestLengthInfluence: config.memory.edgeRestLengthInfluence,
    pointerStrength: config.fields.pointer.strength,
  };

  const scheduleRebuild = (): void => {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(controls.rebuildTopology, 120);
  };

  window.livelyPropertyListener = (name, value) => {
    switch (name) {
      case "preset":
        selectPreset(value);
        break;
      case "edgeBrightness":
        config.render.edgeOpacity =
          defaults.edgeOpacity * (asNumber(value, 55) / 55);
        break;
      case "triangleVisibility":
        config.render.triangleOpacity =
          defaults.triangleOpacity * (asNumber(value, 20) / 20);
        break;
      case "nodeCount":
        config.topology.nodeCount = Math.round(
          defaults.nodeCount * (asNumber(value, 120) / 120),
        );
        scheduleRebuild();
        break;
      case "pressureStrength": {
        const scale = asNumber(value, 100) / 100;
        config.fields.pressure.minimumStrength = defaults.pressureMinimumStrength * scale;
        config.fields.pressure.maximumStrength = defaults.pressureMaximumStrength * scale;
        break;
      }
      case "pressureRadius": {
        const scale = asNumber(value, 100) / 100;
        config.fields.pressure.minimumRadiusRatio = defaults.pressureMinimumRadius * scale;
        config.fields.pressure.maximumRadiusRatio = defaults.pressureMaximumRadius * scale;
        break;
      }
      case "memoryStrength":
        config.memory.edgeRestLengthInfluence =
          defaults.edgeRestLengthInfluence * (asNumber(value, 100) / 100);
        config.memory.enabled = asNumber(value, 100) > 0;
        break;
      case "motionSpeed": {
        const scale = asNumber(value, 100) / 100;
        config.fields.pressure.minimumSpeed = defaults.pressureMinimumSpeed * scale;
        config.fields.pressure.maximumSpeed = defaults.pressureMaximumSpeed * scale;
        config.fields.ambient.speed = defaults.ambientSpeed * scale;
        break;
      }
      case "mouseInteraction":
        config.fields.pointer.enabled = value === true || value === "true";
        break;
      case "mouseStrength":
        config.fields.pointer.strength =
          defaults.pointerStrength * (asNumber(value, 100) / 100);
        break;
      case "quality": {
        const quality = asNumber(value, 1);
        config.performance.maximumDevicePixelRatio = quality <= 0 ? 1 : quality >= 2 ? 2.5 : 2;
        controls.refreshRenderer();
        break;
      }
      case "targetFps":
        config.performance.targetFps = asNumber(value, 1) <= 0 ? 30 : 60;
        break;
    }
  };

  return () => {
    window.clearTimeout(rebuildTimer);
    delete window.livelyPropertyListener;
  };
}
