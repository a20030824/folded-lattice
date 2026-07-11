import type { FoldedLatticeConfig } from "../core/config";
import type { PresetDefinition } from "../core/contracts";
import { pointerSmoothingSystem } from "../core/fields/mouseField";
import { memorySystem } from "../core/memory/updateMemory";
import { springSystem } from "../core/simulation/applySprings";
import { integrationSystem } from "../core/simulation/integrate";
import { resetForcesSystem } from "../core/simulation/resetForces";
import { geometrySystem } from "../core/simulation/updateGeometry";
import { wandererSystem } from "../core/simulation/wanderer";
import { delaunayTopologyBuilder } from "../core/topology/buildTopology";

const config: FoldedLatticeConfig = {
  topology: {
    // Dense weave (judge's call): fine facets so the relief reads as
    // paper grain, not a coarse crystal cloud.
    nodeCount: 620,
    minimumDistanceRatio: 0.028,
    marginRatio: 0.04,
    pinBoundary: true,
    randomSeed: 7351,
  },
  physics: {
    // WATER, not paper: low damping so disturbances travel as visible
    // ripples through the spring weave before they die out.
    springStrength: 26,
    planarSpringStrength: 0.6,
    verticalSpringStrength: 1.6,
    damping: 1.4,
    // Low rest pull: a stiff rest pose traps disturbances as local
    // oscillation; on water the levelling is done by tension.
    restPoseStrength: 0.12,
    // The taut-surface term that lets rings actually travel.
    transverseSpringStrength: 2.2,
    maximumDepthRatio: 0.085,
    maximumVelocity: 320,
    solverIterations: 1,
  },
  fields: {
    // No roaming pressure blobs: the creature is the only actor.
    pressure: {
      count: 0,
      minimumRadiusRatio: 0.1,
      maximumRadiusRatio: 0.2,
      minimumStrength: 0,
      maximumStrength: 0,
      minimumSpeed: 1,
      maximumSpeed: 2,
      wanderStrength: 0,
    },
    ambient: { strength: 0, scale: 0.002, speed: 0.03 },
    // Pointer only feeds influence smoothing; it never touches the
    // sheet directly - it talks exclusively to the creature.
    pointer: {
      enabled: true,
      radiusRatio: 0.2,
      strength: 0,
      dragStrength: 0,
      influenceAttack: 5,
      influenceRelease: 1.2,
    },
  },
  memory: {
    enabled: true,
    edgeAccumulationRate: 0,
    edgeDecayRate: 0,
    edgeRestLengthInfluence: 0,
    // Water does not remember paths; only live waves carry the past.
    triangleAccumulationRate: 0,
    triangleDecayRate: 0.05,
    maximumMemory: 0.6,
  },
  // Unused by the ink renderer; present to satisfy the shared config.
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
    depthProjection: 0.06,
    lightDirection: { x: -0.5, y: -0.42, z: 0.76 },
    atmosphere: {
      fieldGlowOpacity: 0,
      fieldGlowScale: 1,
      vignetteStrength: 0.24,
      centerLift: 0.5,
      nodeGlintOpacity: 0,
    },
    colors: {
      // Pale celadon water: crests catch light, troughs cool toward
      // slate. The dark ink line floats on top.
      background: "#dde5df",
      edge: "#000000",
      edgeHighlight: "#000000",
      trianglePositive: "#f5f8ef",
      triangleNegative: "#96abbd",
      glow: "#eef4ec",
      ink: "#2f3f57",
    },
  },
  performance: {
    targetFps: 60,
    fixedSimulationFps: 60,
    maximumSubSteps: 3,
    maximumDevicePixelRatio: 2,
  },
  creature: {
    enabled: true,
    trailCount: 150,
    segmentSpacingRatio: 0.006,
    baseSpeedRatio: 0.085,
    wanderStrength: 1.7,
    maximumTurnRate: 2.4,
    marginRatio: 0.12,
    pointerRepelRadiusRatio: 0.24,
    pointerRepelTurnRate: 5,
    pointerSpeedBoost: 1.2,
    carveStrength: 80,
    carveRadiusRatio: 0.065,
    inkWidthRatio: 0.005,
  },
};

export const wanderingInkPreset: PresetDefinition = {
  id: "wandering-ink",
  displayName: "Wandering Ink",
  description:
    "A single ink line roams a sheet of pale paper, denting the ground it walks on; the pointer can only frighten it, never touch the paper.",
  config,
  topologyBuilder: delaunayTopologyBuilder,
  simulationSystems: [
    resetForcesSystem,
    wandererSystem,
    springSystem,
    integrationSystem,
    geometrySystem,
    memorySystem,
  ],
  frameSystems: [pointerSmoothingSystem],
};
