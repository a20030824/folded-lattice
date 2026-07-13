import type { FoldedLatticeConfig } from "../core/config";
import { ModuleConfigStore } from "../core/moduleConfig";
import {
  creaseConfigKey,
  type CreaseConfig,
} from "../features/crease/config";
import {
  contourConfigKey,
  type ContourConfig,
} from "../features/tideArchive/config";
import type {
  PresetDefinition,
  PresetRendererResult,
} from "../core/contracts";
import { ambientDriftSystem } from "../core/fields/ambientDriftField";
import { mouseFieldSystem, pointerSmoothingSystem } from "../core/fields/mouseField";
import { pressureFieldSystem } from "../core/fields/pressureField";
import { memorySystem } from "../core/memory/updateMemory";
import { createContourRenderer } from "../core/render/contourRenderer";
import { springSystem } from "../core/simulation/applySprings";
import { integrationSystem } from "../core/simulation/integrate";
import { resetForcesSystem } from "../core/simulation/resetForces";
import { geometrySystem } from "../core/simulation/updateGeometry";
import { creaseTopologyBuilder } from "../features/crease/creaseTopology";
import {
  createBooleanBinding,
  createQualityBinding,
  createScaledNumberBinding,
  createTargetFpsBinding,
} from "../core/propertyBindings";
import type { PropertyBinding } from "../core/propertyBindings";

function createConfig(): FoldedLatticeConfig {
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
    edgeOpacity: 0.9,
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
      background: "#d7ceb9",
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
  };

  const creaseConfig: CreaseConfig = {
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
  };
  config.modules.set(creaseConfigKey, creaseConfig);

  const contourConfig: ContourConfig = {
    cycleSeconds: 30,
    echoCount: 12,
    echoDelaySeconds: 1.25,
    levelRangeRatio: 0.052,
    presentWidth: 1.48,
    echoWidth: 0.6,
    presentColor: "#173b4a",
    recentColor: "#667f86",
    distantColor: "#a1aaa4",
    backgroundLift: "#eee6d2",
    lowFieldColor: "#9db8b5",
    highFieldColor: "#c8ab7d",
    fieldOpacity: 0.28,
    grainOpacity: 0.34,
    legacyCount: 6,
    legacyDurationSeconds: 180,
    legacyColor: "#665b4c",
    legacyOpacity: 0.28,
    legacyWidth: 0.94,
    legacySpatialGrid: 3,
  };
  config.modules.set(contourConfigKey, contourConfig);
  return config;
}

function createPropertyBindings(
  config: FoldedLatticeConfig,
): PropertyBinding[] {
  const defaults = {
    nodeCount: config.topology.nodeCount,
    edgeOpacity: config.render.edgeOpacity,
    pressureMinimumStrength: config.fields.pressure.minimumStrength,
    pressureMaximumStrength: config.fields.pressure.maximumStrength,
    pressureMinimumRadius: config.fields.pressure.minimumRadiusRatio,
    pressureMaximumRadius: config.fields.pressure.maximumRadiusRatio,
    pressureMinimumSpeed: config.fields.pressure.minimumSpeed,
    pressureMaximumSpeed: config.fields.pressure.maximumSpeed,
    ambientSpeed: config.fields.ambient.speed,
    edgeRestLengthInfluence: config.memory.edgeRestLengthInfluence,
    pointerStrength: config.fields.pointer.strength,
  };

  return [
    createScaledNumberBinding("edgeBrightness", 55, (scale) => {
      config.render.edgeOpacity = defaults.edgeOpacity * scale;
    }),
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
    createScaledNumberBinding("memoryStrength", 100, (scale) => {
      config.memory.edgeRestLengthInfluence =
        defaults.edgeRestLengthInfluence * scale;
      config.memory.enabled = scale > 0;
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
  return {
    canvas,
    renderer: createContourRenderer(canvas),
  };
}

export const tideArchivePreset: PresetDefinition = {
  id: "tide-archive",
  aliases: ["tide", "archive", "tide-archive"],
  displayName: "Tide Archive",
  description:
    "An invisible folded field revealed only where a slow tide of height intersects it.",
  createConfig,
  createRenderer,
  topologyBuilder: creaseTopologyBuilder,
  createPropertyBindings,
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
