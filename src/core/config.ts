export interface TopologyConfig {
  nodeCount: number;
  minimumDistanceRatio: number;
  marginRatio: number;
  pinBoundary: boolean;
  randomSeed: number;
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
}
