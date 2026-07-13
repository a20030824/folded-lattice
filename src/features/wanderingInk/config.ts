import { createModuleConfigKey } from "../../core/moduleConfig";

/**
 * The wandering line-creature. All ratios are of the viewport's short
 * side. The creature is the only visible actor of its preset: the mesh
 * is an invisible terrain that records where it has walked.
 */
export interface CreatureConfig {
  enabled: boolean;
  /** Color of the creature body and the ink absorbed into the paper. */
  color: string;
  /**
   * Number of body samples; length = trailCount * segmentSpacingRatio.
   */
  trailCount: number;
  segmentSpacingRatio: number;
  baseSpeedRatio: number;
  /**
   * Amplitude of the noise-driven heading drift, radians per second.
   */
  wanderStrength: number;
  maximumTurnRate: number;
  /**
   * Soft wall: within this distance of the border the creature starts
   * steering back toward open ground.
   */
  marginRatio: number;
  pointerRepelRadiusRatio: number;
  /**
   * Extra turn rate toward the escape direction at full fright.
   */
  pointerRepelTurnRate: number;
  /**
   * Speed multiplier gained at full fright.
   */
  pointerSpeedBoost: number;
  /**
   * Downward force the head presses into the sheet while walking.
   */
  carveStrength: number;
  carveRadiusRatio: number;
  /**
   * Widest brush width of the body stroke.
   */
  inkWidthRatio: number;
}

export const creatureConfigKey = createModuleConfigKey<CreatureConfig>(
  "wandering-ink-creature",
);
