export interface TopologyConfig {
  nodeCount: number;
  minimumDistanceRatio: number;
  marginRatio: number;
  pinBoundary: boolean;
  randomSeed: number;
  /** Optional pinned ring outside the viewport: the triangulated surface fills every pixel. */
  overscanRatio?: number;
}

export interface PhysicsConfig {
  springStrength: number;
  planarSpringStrength: number;
  verticalSpringStrength: number;
  damping: number;
  restPoseStrength: number;
  maximumDepthRatio: number;
  maximumVelocity: number;
  solverIterations: number;
  /**
   * Optional linear z-coupling between edge neighbours, like the
   * pre-tension of a taut membrane. Length-based springs alone have
   * no first-order transverse stiffness, so without this term small
   * ripples cannot travel. 0 (default) keeps the classic behaviour.
   */
  transverseSpringStrength?: number;
}

export interface PressureFieldConfig {
  count: number;
  minimumRadiusRatio: number;
  maximumRadiusRatio: number;
  minimumStrength: number;
  maximumStrength: number;
  minimumSpeed: number;
  maximumSpeed: number;
  wanderStrength: number;
}

export interface AmbientFieldConfig {
  strength: number;
  scale: number;
  speed: number;
}

export interface PointerFieldConfig {
  enabled: boolean;
  radiusRatio: number;
  strength: number;
  dragStrength: number;
  influenceAttack: number;
  influenceRelease: number;
}

export interface FieldConfig {
  pressure: PressureFieldConfig;
  ambient: AmbientFieldConfig;
  pointer: PointerFieldConfig;
}

export interface MemoryConfig {
  enabled: boolean;
  edgeAccumulationRate: number;
  edgeDecayRate: number;
  edgeRestLengthInfluence: number;
  triangleAccumulationRate: number;
  triangleDecayRate: number;
  maximumMemory: number;
}

export interface RevealConfig {
  edgeBaseVisibility: number;
  edgeTensionThreshold: number;
  edgeTensionGain: number;
  edgeMemoryGain: number;
  triangleFoldThreshold: number;
  triangleFoldGain: number;
  triangleMemoryGain: number;
  revealAttack: number;
  revealRelease: number;
  maximumVisibleEdgeRatio: number;
  maximumVisibleTriangleRatio: number;
  /**
   * Structural reveal drifts as coherent patches. Scale is the number of
   * noise cells across the viewport's short side; speed is cells per second.
   */
  patchScale: number;
  patchDriftSpeed: number;
  /**
   * Base brightness added to edges inside a revealed patch.
   */
  patchTrace: number;
  /** Optional travelling-wave reveal, measured from vertical node speed. */
  edgeMotionThreshold?: number;
  edgeMotionGain?: number;
  triangleMotionThreshold?: number;
  triangleMotionGain?: number;
  /** Display knee: sub-threshold edges/nodes collapse to a near-black floor. */
  structureVisibilityThreshold?: number;
  structureVisibilityFloor?: number;
}

export interface ColorConfig {
  background: string;
  edge: string;
  edgeHighlight: string;
  trianglePositive: string;
  triangleNegative: string;
  /**
   * Tint of the faint breathing glow under pressure fields.
   */
  glow: string;
  /**
   * Warm "now" color of a travelling tension pulse. Absent means the
   * renderer never draws a pulse pass.
   */
  pulse?: string;
  /**
   * Body color of the wandering line-creature.
   */
  ink?: string;
}

export interface AtmosphereConfig {
  /**
   * Peak alpha of the glow sprite under each positive pressure field.
   * 0 disables the layer entirely.
   */
  fieldGlowOpacity: number;
  /**
   * Glow radius as a multiple of the field radius.
   */
  fieldGlowScale: number;
  /**
   * Alpha of the corner darkening. 0 disables.
   */
  vignetteStrength: number;
  /**
   * How much the background lifts toward the glow tint at its center, 0-1.
   */
  centerLift: number;
  /**
   * Peak alpha of dew-like points where visible edges meet. 0 disables.
   */
  nodeGlintOpacity: number;
}

export interface RenderConfig {
  edgeMinimumWidth: number;
  edgeMaximumWidth: number;
  edgeOpacity: number;
  triangleOpacity: number;
  highlightOpacity: number;
  depthProjection: number;
  lightDirection: { x: number; y: number; z: number };
  atmosphere: AtmosphereConfig;
  colors: ColorConfig;
}

export interface PerformanceConfig {
  targetFps: number;
  fixedSimulationFps: number;
  maximumSubSteps: number;
  maximumDevicePixelRatio: number;
}

/**
 * Crumpled-sheet presets: fold-line network, density-varying sampling,
 * and the paper renderer's material parameters. Ratios are of the
 * viewport's short side.
 */
export interface CreaseConfig {
  majorCount: number;
  minorCount: number;

  /**
   * Peak rest-pose height of a full-strength crease.
   */
  amplitudeRatio: number;
  majorWidthRatio: number;
  minorWidthRatio: number;

  /**
   * Node spacing along crease lines.
   */
  creaseSpacingRatio: number;
  /**
   * Sampling min-distance next to creases vs. in open facets.
   */
  nearDensityRatio: number;
  farDensityRatio: number;
  /**
   * Distance over which sampling density decays to sparse.
   */
  densityFalloffRatio: number;

  grainOpacity: number;
  valleyShadowStrength: number;
  ridgeLightStrength: number;

  paperLit: string;
  paperShadow: string;
  ridgeColor: string;
  /**
   * Occluded areas sink toward this tint, never toward black - shadows
   * have a color of their own.
   */
  shadowTint: string;

  /**
   * Curvature of fold lines in radians per walk step; real creases are
   * near-straight but never ruler-straight.
   */
  curliness: number;

  life?: CreaseLifeConfig;
}

/**
 * Slow life cycle of the fold network: new creases grow tip-forward,
 * mature ones fade or get pressed flat, and a long press by the pointer
 * sets a fresh fold. All timescales are in seconds.
 */
export interface CreaseLifeConfig {
  enabled: boolean;
  /**
   * Average pause between spontaneous fold events.
   */
  spawnIntervalSeconds: number;
  growSeconds: number;
  /**
   * Typical lifetime of a minor fold before it has fully healed.
   */
  fadeSeconds: number;
  /**
   * Hold duration after which a pressed pointer sets a new crease.
   */
  pressSeconds: number;
  maximumMinorCount: number;
  /**
   * The skeleton iterates too, on a much longer period: about this often
   * one major fold hands over to a newly grown one. 0 disables.
   */
  majorIntervalSeconds: number;
  /**
   * The major count itself may drift inside these bounds: a handover
   * sometimes only retires, sometimes only grows. Both default to the
   * built count when absent.
   */
  minimumMajorCount?: number;
  maximumMajorCount?: number;
  /**
   * Event-rate multiplier while nobody is at the desk (pointer absent
   * for a while) - the paper lives a little faster when unwatched.
   * 1 or absent disables.
   */
  idleRateBoost?: number;
}

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
   * a faint ripple at the far side — otherwise the trace would cover
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

/**
 * The wandering line-creature. All ratios are of the viewport's short
 * side. The creature is the only visible actor of its preset: the mesh
 * is an invisible terrain that records where it has walked.
 */
export interface CreatureConfig {
  enabled: boolean;
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

export interface FoldedLatticeConfig {
  topology: TopologyConfig;
  physics: PhysicsConfig;
  fields: FieldConfig;
  memory: MemoryConfig;
  reveal: RevealConfig;
  render: RenderConfig;
  performance: PerformanceConfig;
  crease?: CreaseConfig;
  contour?: ContourConfig;
  pulse?: PulseConfig;
  membraneWave?: MembraneWaveConfig;
  creature?: CreatureConfig;
}
