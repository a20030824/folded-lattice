import { createModuleConfigKey } from "../../core/moduleConfig";

/**
 * Crumpled-sheet presets: fold-line network, density-varying sampling,
 * and the paper renderer's material parameters. Ratios are of the
 * viewport's short side.
 */
export interface CreaseConfig {
  majorCount: number;
  minorCount: number;

  /** Peak rest-pose height of a full-strength crease. */
  amplitudeRatio: number;
  majorWidthRatio: number;
  minorWidthRatio: number;

  /** Node spacing along crease lines. */
  creaseSpacingRatio: number;
  /** Sampling min-distance next to creases vs. in open facets. */
  nearDensityRatio: number;
  farDensityRatio: number;
  /** Distance over which sampling density decays to sparse. */
  densityFalloffRatio: number;

  grainOpacity: number;
  valleyShadowStrength: number;
  ridgeLightStrength: number;

  paperLit: string;
  paperShadow: string;
  ridgeColor: string;
  /** Occluded areas sink toward this tint, never toward black. */
  shadowTint: string;

  /** Curvature of fold lines in radians per walk step. */
  curliness: number;

  life?: CreaseLifeConfig;
}

/** Slow life cycle of the fold network. All timescales are in seconds. */
export interface CreaseLifeConfig {
  enabled: boolean;
  /** Average pause between spontaneous fold events. */
  spawnIntervalSeconds: number;
  growSeconds: number;
  /** Typical lifetime of a minor fold before it has fully healed. */
  fadeSeconds: number;
  /** Hold duration after which a pressed pointer sets a new crease. */
  pressSeconds: number;
  maximumMinorCount: number;
  /** How often one major fold hands over to a newly grown one. */
  majorIntervalSeconds: number;
  /** Major count bounds; both default to the built count when absent. */
  minimumMajorCount?: number;
  maximumMajorCount?: number;
  /** Event-rate multiplier while nobody is at the desk. */
  idleRateBoost?: number;
}

export const creaseConfigKey = createModuleConfigKey<CreaseConfig>(
  "crease-config",
);
