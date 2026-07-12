import { createModuleConfigKey } from "../../core/moduleConfig";

/**
 * A moving height plane reveals the otherwise invisible surface. Older
 * slices remain briefly as cool contour echoes: time is drawn as distance.
 */
export interface ContourConfig {
  cycleSeconds: number;
  echoCount: number;
  echoDelaySeconds: number;
  levelRangeRatio: number;
  presentWidth: number;
  echoWidth: number;
  presentColor: string;
  recentColor: string;
  distantColor: string;
  backgroundLift: string;
  /** Cool lowlands and warm highlands, washed faintly into the chart. */
  lowFieldColor: string;
  highFieldColor: string;
  fieldOpacity: number;
  /** Static paper fiber contrast; the chart is a material, not a flat fill. */
  grainOpacity: number;
  /** Selective minute-scale memory: only scored events enter this layer. */
  legacyCount: number;
  legacyDurationSeconds: number;
  legacyColor: string;
  legacyOpacity: number;
  legacyWidth: number;
  /** Grid used to keep long-term marks from repeatedly occupying one region. */
  legacySpatialGrid: number;
}

export const contourConfigKey = createModuleConfigKey<ContourConfig>(
  "tide-archive-contour",
);
