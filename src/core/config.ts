import type { ModuleConfigStore } from "./moduleConfig";

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

export interface FoldedLatticeConfig {
  topology: TopologyConfig;
  physics: PhysicsConfig;
  fields: FieldConfig;
  memory: MemoryConfig;
  reveal: RevealConfig;
  render: RenderConfig;
  performance: PerformanceConfig;
  modules: ModuleConfigStore;
}
