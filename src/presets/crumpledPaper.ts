import type { FoldedLatticeConfig } from "../core/config";
import { ModuleConfigStore } from "../core/moduleConfig";
import type {
  PresetDefinition,
  PresetRendererResult,
} from "../core/contracts";
import { ambientDriftSystem } from "../core/fields/ambientDriftField";
import { mouseFieldSystem, pointerSmoothingSystem } from "../core/fields/mouseField";
import { pressureFieldSystem } from "../core/fields/pressureField";
import { createPaperRenderer } from "../core/render/paperRenderer";
import { createWebglPaperRenderer } from "../core/render/webglPaperRenderer";
import {
  createBooleanBinding,
  createQualityBinding,
  createScaledNumberBinding,
  createTargetFpsBinding,
} from "../wallpaper/properties";
import type { PropertyBinding } from "../wallpaper/properties";
import { springSystem } from "../core/simulation/applySprings";
import { creaseLifeSystem } from "../core/simulation/creaseLife";
import { integrationSystem } from "../core/simulation/integrate";
import { resetForcesSystem } from "../core/simulation/resetForces";
import { geometrySystem } from "../core/simulation/updateGeometry";
import { creaseTopologyBuilder } from "../core/topology/creaseTopology";

function createConfig(): FoldedLatticeConfig {
  return {
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
  modules: new ModuleConfigStore(),
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
      majorIntervalSeconds: 60,
      minimumMajorCount: 2,
      maximumMajorCount: 4,
      idleRateBoost: 1.5,
    },
  },
  };
}

function createPropertyBindings(
  config: FoldedLatticeConfig,
): PropertyBinding[] {
  const defaults = {
    nodeCount: config.topology.nodeCount,
    pressureMinimumStrength: config.fields.pressure.minimumStrength,
    pressureMaximumStrength: config.fields.pressure.maximumStrength,
    pressureMinimumRadius: config.fields.pressure.minimumRadiusRatio,
    pressureMaximumRadius: config.fields.pressure.maximumRadiusRatio,
    pressureMinimumSpeed: config.fields.pressure.minimumSpeed,
    pressureMaximumSpeed: config.fields.pressure.maximumSpeed,
    ambientSpeed: config.fields.ambient.speed,
    pointerStrength: config.fields.pointer.strength,
  };

  return [
    createScaledNumberBinding("nodeCount", 100, (scale, context) => {
      config.topology.nodeCount = Math.round(defaults.nodeCount * scale);
      context.scheduleTopologyRebuild();
    }),
    createScaledNumberBinding("pressureStrength", 100, (scale) => {
      config.fields.pressure.minimumStrength =
        defaults.pressureMinimumStrength * scale;
      config.fields.pressure.maximumStrength =
        defaults.pressureMaximumStrength * scale;
    }),
    createScaledNumberBinding("pressureRadius", 100, (scale) => {
      config.fields.pressure.minimumRadiusRatio =
        defaults.pressureMinimumRadius * scale;
      config.fields.pressure.maximumRadiusRatio =
        defaults.pressureMaximumRadius * scale;
    }),
    createScaledNumberBinding("motionSpeed", 100, (scale) => {
      config.fields.pressure.minimumSpeed = defaults.pressureMinimumSpeed * scale;
      config.fields.pressure.maximumSpeed = defaults.pressureMaximumSpeed * scale;
      config.fields.ambient.speed = defaults.ambientSpeed * scale;
    }),
    createBooleanBinding("mouseInteraction", (enabled) => {
      config.fields.pointer.enabled = enabled;
    }),
    createScaledNumberBinding("mouseStrength", 100, (scale) => {
      config.fields.pointer.strength = defaults.pointerStrength * scale;
    }),
    createQualityBinding((maximumDevicePixelRatio, context) => {
      config.performance.maximumDevicePixelRatio = maximumDevicePixelRatio;
      context.refreshRenderer();
    }),
    createTargetFpsBinding((targetFps) => {
      config.performance.targetFps = targetFps;
    }),
  ];
}

function createRenderer(
  canvas: HTMLCanvasElement,
  _config: FoldedLatticeConfig,
): PresetRendererResult {
  try {
    return {
      canvas,
      renderer: createWebglPaperRenderer(canvas),
    };
  } catch (error) {
    console.error(
      "WebGL paper renderer unavailable, falling back:",
      error,
    );

    const replacement = canvas.cloneNode(false) as HTMLCanvasElement;
    canvas.replaceWith(replacement);

    return {
      canvas: replacement,
      renderer: createPaperRenderer(replacement),
    };
  }
}

export const crumpledPaperPreset: PresetDefinition = {
  id: "crumpled-paper",
  aliases: ["paper", "crumpled-paper"],
  displayName: "Crumpled Paper",
  description:
    "A sheet of dark paper crumpled into ridges and valleys, breathing under a fixed cold light.",
  createConfig,
  createRenderer,
  topologyBuilder: creaseTopologyBuilder,
  createPropertyBindings,
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
