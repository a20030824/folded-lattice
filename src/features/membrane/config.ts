import { createModuleConfigKey } from "../../core/moduleConfig";

/**
 * The membrane's long-period event: every few dozen seconds a tension
 * pulse is born at one node and travels outward through the edge graph.
 * The warm front is "now"; the structural memory it deposits stays
 * visible for minutes as a cooling trace of "just before".
 */
export interface PulseConfig {
  enabled: boolean;
  /**
   * Average pause between pulses, randomized ±30%.
   */
  intervalSeconds: number;
  /**
   * Front speed in short-sides per second.
   */
  speedRatio: number;
  /**
   * Front thickness as a ratio of the short side.
   */
  bandRatio: number;
  /**
   * Distance (in short sides) over which the pulse loses ~63% of its
   * energy. Keeps the event local: a strong mark near the origin, only
   * a faint ripple at the far side - otherwise the trace would cover
   * the whole membrane and read as homogeneous brightening.
   */
  falloffRatio: number;
  /**
   * Memory deposited per second on an edge fully inside the front.
   */
  memoryDeposit: number;
  /**
   * Upward force on nodes as the front passes; the membrane physically
   * breathes the event instead of only being repainted.
   */
  kickStrength: number;
  /**
   * Chance that a pulse originates at the most-remembered node (where
   * the membrane was touched) instead of a random interior one.
   */
  memoryOriginChance: number;
  /** A fresh pointer press launches the same visible front from the touched node. */
  pointerTrigger?: boolean;
}

export const pulseConfigKey = createModuleConfigKey<PulseConfig>(
  "breathing-membrane-pulse",
);

/** Pointer gestures excite travelling waves in a taut membrane. */
export interface MembraneWaveConfig {
  enabled: boolean;
  impactRadiusRatio: number;
  impactStrength: number;
  impactSeconds: number;
  dragSpacingRatio: number;
  dragStrength: number;
  dragSeconds: number;
}

export const membraneWaveConfigKey =
  createModuleConfigKey<MembraneWaveConfig>(
    "breathing-membrane-wave",
  );

/**
 * A slow second memory layer for triangles, independent of memoryBias.
 * It deposits from live pulse activity, diffuses to neighboring
 * triangles each step (so its shape bleeds like a stain rather than
 * tracing the pulse's exact geodesic front), and decays over minutes.
 */
export interface LegacyMemoryConfig {
  enabled: boolean;
  /** Legacy gained per second under a fully-lit pulse front. */
  depositRate: number;
  /** Fraction relaxed toward the neighbor average per second. */
  diffusionRate: number;
  /** Time constant of the slow exponential decay. */
  decaySeconds: number;
  /** Clamp, kept low so the trace stays a faint bias, not a scar. */
  maximum: number;
}

export const legacyMemoryConfigKey =
  createModuleConfigKey<LegacyMemoryConfig>(
    "breathing-membrane-legacy-memory",
  );
