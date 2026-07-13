export interface PropertyBindingContext {
  rebuildTopology(): void;
  scheduleTopologyRebuild(): void;
  refreshRenderer(): void;
}

export interface PropertyBinding {
  name: string;
  apply(value: unknown, context: PropertyBindingContext): void;
}

export function asNumber(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}

export function createScaledNumberBinding(
  name: string,
  inputBaseline: number,
  applyScale: (scale: number, context: PropertyBindingContext) => void,
): PropertyBinding {
  return {
    name,
    apply(value, context) {
      applyScale(
        asNumber(value, inputBaseline) / inputBaseline,
        context,
      );
    },
  };
}

export function createBooleanBinding(
  name: string,
  applyValue: (enabled: boolean, context: PropertyBindingContext) => void,
): PropertyBinding {
  return {
    name,
    apply(value, context) {
      applyValue(asBoolean(value), context);
    },
  };
}

export function createQualityBinding(
  applyDevicePixelRatio: (
    maximumDevicePixelRatio: number,
    context: PropertyBindingContext,
  ) => void,
): PropertyBinding {
  return {
    name: "quality",
    apply(value, context) {
      const quality = asNumber(value, 1);
      applyDevicePixelRatio(
        quality <= 0 ? 1 : quality >= 2 ? 2.5 : 2,
        context,
      );
    },
  };
}

export function createTargetFpsBinding(
  applyTargetFps: (
    targetFps: number,
    context: PropertyBindingContext,
  ) => void,
): PropertyBinding {
  return {
    name: "targetFps",
    apply(value, context) {
      applyTargetFps(asNumber(value, 1) <= 0 ? 30 : 60, context);
    },
  };
}
