import type { FoldedLatticeConfig } from "../core/config";
import type { PresetDefinition } from "../core/contracts";
import { ambientDriftSystem } from "../core/fields/ambientDriftField";
import { mouseFieldSystem, pointerSmoothingSystem } from "../core/fields/mouseField";
import { pressureFieldSystem } from "../core/fields/pressureField";
import { springSystem } from "../core/simulation/applySprings";
import { creaseLifeSystem } from "../core/simulation/creaseLife";
import { integrationSystem } from "../core/simulation/integrate";
import { resetForcesSystem } from "../core/simulation/resetForces";
import { geometrySystem } from "../core/simulation/updateGeometry";
import { creaseTopologyBuilder } from "../core/topology/creaseTopology";

const config: FoldedLatticeConfig = {
  topology: {
    nodeCount: 380,
    minimumDistanceRatio: 0.05,
    marginRatio: 0.045,
    pinBoundary: true,
    randomSeed: 18521,
  },
  physics: {
    // Stiff in plane like paper, but compliant in z so touch and breath read.
    springStrength: 7,
    planarSpringStrength: 0.9,
    verticalSpringStrength: 0.5,
    damping: 4.6,
    restPoseStrength: 0.32,
    maximumDepthRatio: 0.13,
    maximumVelocity: 300,
    solverIterations: 1,
  },
  fields: {
    pressure: {
      count: 2,
      minimumRadiusRatio: 0.2,
      maximumRadiusRatio: 0.34,
      minimumStrength: 14,
      maximumStrength: 30,
      minimumSpeed: 1.5,
      maximumSpeed: 4.5,
      wanderStrength: 0.2,
    },
    ambient: { strength: 0.7, scale: 0.002, speed: 0.035 },
    pointer: {
      enabled: true,
      radiusRatio: 0.14,
      strength: 720,
      dragStrength: 0.22,
      influenceAttack: 5,
      influenceRelease: 1.1,
    },
  },
  memory: {
    enabled: false,
    edgeAccumulationRate: 0,
    edgeDecayRate: 0,
    edgeRestLengthInfluence: 0,
    triangleAccumulationRate: 0,
    triangleDecayRate: 0,
    maximumMemory: 0,
  },
  // Unused by the paper renderer; present to satisfy the shared config.
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
    edgeOpacity: 0,
    triangleOpacity: 1,
    highlightOpacity: 0,
    depthProjection: 0.085,
    lightDirection: { x: -0.55, y: -0.45, z: 0.72 },
    atmosphere: {
      fieldGlowOpacity: 0,
      fieldGlowScale: 1,
      vignetteStrength: 0.5,
      centerLift: 0,
      nodeGlintOpacity: 0,
    },
    colors: {
      background: "#10131a",
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
    majorCount: 3,
    minorCount: 9,
    amplitudeRatio: 0.045,
    majorWidthRatio: 0.11,
    minorWidthRatio: 0.06,
    creaseSpacingRatio: 0.028,
    nearDensityRatio: 0.026,
    farDensityRatio: 0.16,
    densityFalloffRatio: 0.2,
    grainOpacity: 0.35,
    valleyShadowStrength: 0.5,
    ridgeLightStrength: 0.55,
    paperLit: "#b3a78c",
    paperShadow: "#4c545f",
    ridgeColor: "#f0e6d2",
    shadowTint: "#242b3a",
    curliness: 0.022,
    life: {
      enabled: true,
      spawnIntervalSeconds: 34,
      growSeconds: 7,
      fadeSeconds: 110,
      pressSeconds: 1.1,
      maximumMinorCount: 10,
      majorIntervalSeconds: 200,
    },
  },
};

export const crumpledPaperPreset: PresetDefinition = {
  id: "crumpled-paper",
  displayName: "Crumpled Paper",
  description:
    "A sheet of dark paper crumpled into ridges and valleys, breathing under a fixed cold light.",
  config,
  topologyBuilder: creaseTopologyBuilder,
  simulationSystems: [
    resetForcesSystem,
    pressureFieldSystem,
    ambientDriftSystem,
    mouseFieldSystem,
    creaseLifeSystem,
    springSystem,
    integrationSystem,
    geometrySystem,
  ],
  frameSystems: [pointerSmoothingSystem],
};
