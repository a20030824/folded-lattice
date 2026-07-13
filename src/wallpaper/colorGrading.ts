import type { FoldedLatticeConfig } from "../core/config";
import { clamp, parseColor } from "../core/math";
import {
  asNumber,
  type PropertyBinding,
} from "../core/propertyBindings";
import { creaseConfigKey } from "../features/crease/config";
import { pulseConfigKey } from "../features/membrane/config";
import { contourConfigKey } from "../features/tideArchive/config";
import { creatureConfigKey } from "../features/wanderingInk/config";

export interface ColorGradingSettings {
  brightness: number;
  temperature: number;
  tint: number;
}

interface MutableColorReference {
  get(): string;
  set(value: string): void;
}

function colorReference<T extends object, K extends keyof T>(
  target: T,
  key: K,
): MutableColorReference {
  const initial = Reflect.get(target, key);
  if (typeof initial !== "string") {
    throw new Error(`Color property "${String(key)}" is not a string.`);
  }

  return {
    get() {
      const value = Reflect.get(target, key);
      return typeof value === "string" ? value : initial;
    },
    set(value) {
      Reflect.set(target, key, value);
    },
  };
}

function renderColorReferences(
  config: FoldedLatticeConfig,
): MutableColorReference[] {
  const colors = config.render.colors;
  return [
    colorReference(colors, "background"),
    colorReference(colors, "edge"),
    colorReference(colors, "edgeHighlight"),
    colorReference(colors, "trianglePositive"),
    colorReference(colors, "triangleNegative"),
    colorReference(colors, "glow"),
  ];
}

function presetColorReferences(
  presetId: string,
  config: FoldedLatticeConfig,
): MutableColorReference[] {
  const references = renderColorReferences(config);

  if (presetId === "breathing-membrane") {
    const pulse = config.modules.require(pulseConfigKey);
    references.push(colorReference(pulse, "color"));
  } else if (presetId === "crumpled-paper") {
    const crease = config.modules.require(creaseConfigKey);
    references.push(
      colorReference(crease, "paperLit"),
      colorReference(crease, "paperShadow"),
      colorReference(crease, "ridgeColor"),
      colorReference(crease, "shadowTint"),
    );
  } else if (presetId === "wandering-ink") {
    const creature = config.modules.require(creatureConfigKey);
    references.push(colorReference(creature, "color"));
  } else if (presetId === "tide-archive") {
    const contour = config.modules.require(contourConfigKey);
    references.push(
      colorReference(contour, "presentColor"),
      colorReference(contour, "recentColor"),
      colorReference(contour, "distantColor"),
      colorReference(contour, "backgroundLift"),
      colorReference(contour, "lowFieldColor"),
      colorReference(contour, "highFieldColor"),
      colorReference(contour, "legacyColor"),
    );
  }

  return references;
}

function toHexChannel(value: number): string {
  return Math.round(clamp(value, 0, 255))
    .toString(16)
    .padStart(2, "0");
}

export function gradeHexColor(
  color: string,
  settings: Readonly<ColorGradingSettings>,
): string {
  if (!/^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.trim())) {
    return color;
  }

  const parsed = parseColor(color);
  const brightness = clamp(settings.brightness, 50, 150) / 100;
  const temperature = clamp(settings.temperature, -100, 100) / 100;
  const tint = clamp(settings.tint, -100, 100) / 100;

  const redGain = brightness * (1 + temperature * 0.18 + tint * 0.08);
  const greenGain = brightness * (1 + temperature * 0.02 - tint * 0.12);
  const blueGain = brightness * (1 - temperature * 0.18 + tint * 0.08);

  return `#${toHexChannel(parsed.r * redGain)}${toHexChannel(
    parsed.g * greenGain,
  )}${toHexChannel(parsed.b * blueGain)}`;
}

export function createPresetColorGradingBindings(
  presetId: string,
  config: FoldedLatticeConfig,
): PropertyBinding[] {
  const references = presetColorReferences(presetId, config);
  const originals = references.map((reference) => reference.get());
  const settings: ColorGradingSettings = {
    brightness: 100,
    temperature: 0,
    tint: 0,
  };

  const apply = (): void => {
    for (let index = 0; index < references.length; index += 1) {
      references[index]!.set(gradeHexColor(originals[index]!, settings));
    }
  };

  return [
    {
      name: "brightness",
      apply(value) {
        settings.brightness = clamp(asNumber(value, 100), 50, 150);
        apply();
      },
    },
    {
      name: "temperature",
      apply(value) {
        settings.temperature = clamp(asNumber(value, 0), -100, 100);
        apply();
      },
    },
    {
      name: "tint",
      apply(value) {
        settings.tint = clamp(asNumber(value, 0), -100, 100);
        apply();
      },
    },
  ];
}
