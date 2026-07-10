import type { FoldedLatticeConfig } from "../core/config";
import type { PresetDefinition } from "../core/contracts";
import { ambientDriftSystem } from "../core/fields/ambientDriftField";
import { mouseFieldSystem, pointerSmoothingSystem } from "../core/fields/mouseField";
import { pressureFieldSystem } from "../core/fields/pressureField";
import { memorySystem } from "../core/memory/updateMemory";
import { springSystem } from "../core/simulation/applySprings";
import { integrationSystem } from "../core/simulation/integrate";
import { resetForcesSystem } from "../core/simulation/resetForces";
import { geometrySystem } from "../core/simulation/updateGeometry";
import { creaseTopologyBuilder } from "../core/topology/creaseTopology";

const config: FoldedLatticeConfig = {
  topology: {
    nodeCount: 320,
    minimumDistanceRatio: 0.045,
    marginRatio: 0.04,
    pinBoundary: true,
    randomSeed: 75083,
  },
  physics: {
    springStrength: 8.5,
    planarSpringStrength: 0.88,
    verticalSpringStrength: 0.48,
    damping: 3.8,
    restPoseStrength: 0.28,
    maximumDepthRatio: 0.16,
    maximumVelocity: 320,
    solverIterations: 1,
  },
  fields: {
    pressure: {
      count: 3,
      minimumRadiusRatio: 0.2,
      maximumRadiusRatio: 0.36,
      minimumStrength: 22,
      maximumStrength: 52,
      minimumSpeed: 1.2,
      maximumSpeed: 3.6,
      wanderStrength: 0.18,
    },
    ambient: { strength: 0.62, scale: 0.0018, speed: 0.028 },
    pointer: {
      enabled: true,
      radiusRatio: 0.17,
      strength: 820,
      dragStrength: 0.14,
      influenceAttack: 5.2,
      influenceRelease: 0.9,
    },
  },
  memory: {
    enabled: true,
    edgeAccumulationRate: 0.018,
    edgeDecayRate: 0.0015,
    edgeRestLengthInfluence: 0.006,
    triangleAccumulationRate: 0.012,
    triangleDecayRate: 0.001,
    maximumMemory: 0.45,
  },
  reveal: {
    edgeBaseVisibility: 0,
    edgeTensionThreshold: 1,
    edgeTensionGain: 0,
    edgeMemoryGain: 0,
    triangleFoldThreshold: 1,
    triangleFoldGain: 0,
    triangleMemoryGain: 0,
    revealAttack: 1,
    revealRelease: 1,
    maximumVisibleEdgeRatio: 0,
    maximumVisibleTriangleRatio: 0,
    patchScale: 1,
    patchDriftSpeed: 0,
    patchTrace: 0,
  },
  render: {
    edgeMinimumWidth: 0,
    edgeMaximumWidth: 0,
    edgeOpacity: 0.88,
    triangleOpacity: 0,
    highlightOpacity: 0,
    depthProjection: 0.035,
    lightDirection: { x: -0.4, y: -0.35, z: 0.84 },
    atmosphere: {
      fieldGlowOpacity: 0,
      fieldGlowScale: 1,
      vignetteStrength: 0,
      centerLift: 0,
      nodeGlintOpacity: 0,
    },
    colors: {
      background: "#070a0f",
      edge: "#000000",
      edgeHighlight: "#000000",
      trianglePositive: "#000000",
      triangleNegative: "#000000",
      glow: "#000000",
    },
  },
  performance: {
    targetFps: 60,
    fixedSimulationFps: 60,
    maximumSubSteps: 3,
    maximumDevicePixelRatio: 2,
  },
  crease: {
    majorCount: 4,
    minorCount: 7,
    amplitudeRatio: 0.065,
    majorWidthRatio: 0.18,
    minorWidthRatio: 0.095,
    creaseSpacingRatio: 0.034,
    nearDensityRatio: 0.032,
    farDensityRatio: 0.13,
    densityFalloffRatio: 0.22,
    grainOpacity: 0,
    valleyShadowStrength: 0,
    ridgeLightStrength: 0,
    paperLit: "#000000",
    paperShadow: "#000000",
    ridgeColor: "#000000",
    shadowTint: "#000000",
    curliness: 0.02,
  },
  contour: {
    cycleSeconds: 30,
    echoCount: 12,
    echoDelaySeconds: 1.25,
    levelRangeRatio: 0.052,
    presentWidth: 1.18,
    echoWidth: 0.72,
    presentColor: "#f0d9a8",
    recentColor: "#87a5b7",
    distantColor: "#30485a",
    backgroundLift: "#0d151e",
  },
};

export const tideArchivePreset: PresetDefinition = {
  id: "tide-archive",
  displayName: "Tide Archive",
  description:
    "An invisible folded field revealed only where a slow tide of height intersects it.",
  config,
  topologyBuilder: creaseTopologyBuilder,
  simulationSystems: [
    resetForcesSystem,
    pressureFieldSystem,
    ambientDriftSystem,
    mouseFieldSystem,
    springSystem,
    integrationSystem,
    geometrySystem,
    memorySystem,
  ],
  frameSystems: [pointerSmoothingSystem],
};
