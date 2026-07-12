import type { FoldedLatticeConfig } from "../core/config";
import { ModuleConfigStore } from "../core/moduleConfig";
import {
  membraneWaveConfigKey,
  pulseConfigKey,
  type MembraneWaveConfig,
  type PulseConfig,
} from "../features/membrane/config";
import type {
  PresetDefinition,
  PresetRendererResult,
} from "../core/contracts";
import { createCanvasRenderer } from "../core/render/canvasRenderer";
import { createWebglMembraneRenderer } from "../core/render/webglMembraneRenderer";
import {
  createBooleanBinding,
  createQualityBinding,
  createScaledNumberBinding,
  createTargetFpsBinding,
} from "../wallpaper/properties";
import type { PropertyBinding } from "../wallpaper/properties";
import { ambientDriftSystem } from "../core/fields/ambientDriftField";
import { pointerSmoothingSystem } from "../core/fields/mouseField";
import { pressureFieldSystem } from "../core/fields/pressureField";
import { legacyMemorySystem } from "../core/memory/updateLegacy";
import { memorySystem } from "../core/memory/updateMemory";
import { revealSystem } from "../core/reveal/updateReveal";
import { springSystem } from "../core/simulation/applySprings";
import { membranePulseSystem } from "../core/simulation/membranePulse";
import { membraneWaveSystem } from "../core/simulation/membraneWave";
import { integrationSystem } from "../core/simulation/integrate";
import { resetForcesSystem } from "../core/simulation/resetForces";
import { geometrySystem } from "../core/simulation/updateGeometry";
import { delaunayTopologyBuilder } from "../core/topology/buildTopology";

function createConfig(): FoldedLatticeConfig {
  const config: FoldedLatticeConfig = {
  topology: {
    nodeCount: 260,
    minimumDistanceRatio: 0.043,
    marginRatio: 0.04,
    pinBoundary: true,
    randomSeed: 42173,
    overscanRatio: 0.045,
  },
  physics: {
    springStrength: 14,
    planarSpringStrength: 0.55,
    verticalSpringStrength: 1,
    // Loosened so disturbances ring outward as travelling waves; the
    // taut-membrane term below is inherited from the water experiment
    // (judge's call: the wave language belongs to the membrane).
    damping: 1.9,
    restPoseStrength: 0.2,
    maximumDepthRatio: 0.065,
    maximumVelocity: 280,
    solverIterations: 1,
    transverseSpringStrength: 2.4,
  },
  fields: {
    pressure: {
      count: 3,
      minimumRadiusRatio: 0.12,
      maximumRadiusRatio: 0.27,
      minimumStrength: 18,
      maximumStrength: 42,
      minimumSpeed: 2,
      maximumSpeed: 8,
      wanderStrength: 0.28,
    },
    ambient: { strength: 1.1, scale: 0.002, speed: 0.045 },
    pointer: {
      enabled: true,
      radiusRatio: 0.13,
      strength: 0,
      dragStrength: 0,
      influenceAttack: 4,
      influenceRelease: 1.3,
    },
  },
  memory: {
    enabled: true,
    edgeAccumulationRate: 0.025,
    // Fast enough that pulse traces read as "just before" yet cannot
    // stack across pulses into a permanently revealed web.
    edgeDecayRate: 0.008,
    edgeRestLengthInfluence: 0.012,
    triangleAccumulationRate: 0.018,
    triangleDecayRate: 0.004,
    maximumMemory: 0.7,
  },
  reveal: {
    edgeBaseVisibility: 0.008,
    edgeTensionThreshold: 0.006,
    edgeTensionGain: 22,
    edgeMemoryGain: 0.34,
    triangleFoldThreshold: 0.03,
    triangleFoldGain: 6.5,
    triangleMemoryGain: 0.2,
    revealAttack: 1.6,
    revealRelease: 0.4,
    maximumVisibleEdgeRatio: 0.2,
    maximumVisibleTriangleRatio: 0.16,
    patchScale: 1.9,
    patchDriftSpeed: 0.045,
    patchTrace: 0.075,
    edgeMotionThreshold: 1.2,
    edgeMotionGain: 0.085,
    triangleMotionThreshold: 1.5,
    triangleMotionGain: 0.06,
    structureVisibilityThreshold: 0.35,
    structureVisibilityFloor: 0.0015,
  },
  render: {
    edgeMinimumWidth: 0.5,
    edgeMaximumWidth: 1.5,
    edgeOpacity: 0.46,
    triangleOpacity: 0.2,
    highlightOpacity: 0.6,
    depthProjection: 0.085,
    lightDirection: { x: -0.45, y: -0.3, z: 0.84 },
    atmosphere: {
      fieldGlowOpacity: 0.075,
      fieldGlowScale: 1.7,
      vignetteStrength: 0.42,
      centerLift: 0.075,
      nodeGlintOpacity: 0.1,
    },
    colors: {
      background: "#0a0e14",
      edge: "#93a9b8",
      edgeHighlight: "#e9f3f6",
      trianglePositive: "#b9cdd8",
      triangleNegative: "#274050",
      glow: "#5f8ba0",
      pulse: "#f0ddb4",
    },
  },
  performance: {
    targetFps: 60,
    fixedSimulationFps: 60,
    maximumSubSteps: 3,
    maximumDevicePixelRatio: 2,
  },
  modules: new ModuleConfigStore(),
  legacy: {
    enabled: true,
    depositRate: 0.05,
    diffusionRate: 0.35,
    decaySeconds: 220,
    maximum: 0.3,
  },
  };

  const membraneWaveConfig: MembraneWaveConfig = {
    enabled: true,
    impactRadiusRatio: 0.038,
    impactStrength: 4200,
    impactSeconds: 0.14,
    dragSpacingRatio: 0.025,
    dragStrength: 1500,
    dragSeconds: 0.09,
  };
  config.modules.set(membraneWaveConfigKey, membraneWaveConfig);

  const pulseConfig: PulseConfig = {
    enabled: true,
    intervalSeconds: 3,
    speedRatio: 0.1,
    bandRatio: 0.055,
    falloffRatio: 0.24,
    memoryDeposit: 0.55,
    kickStrength: 5600,
    memoryOriginChance: 0.55,
    pointerTrigger: true,
  };
  config.modules.set(pulseConfigKey, pulseConfig);
  return config;
}

function createPropertyBindings(
  config: FoldedLatticeConfig,
): PropertyBinding[] {
  const defaults = {
    nodeCount: config.topology.nodeCount,
    edgeOpacity: config.render.edgeOpacity,
    triangleOpacity: config.render.triangleOpacity,
    pressureMinimumStrength: config.fields.pressure.minimumStrength,
    pressureMaximumStrength: config.fields.pressure.maximumStrength,
    pressureMinimumRadius: config.fields.pressure.minimumRadiusRatio,
    pressureMaximumRadius: config.fields.pressure.maximumRadiusRatio,
    pressureMinimumSpeed: config.fields.pressure.minimumSpeed,
    pressureMaximumSpeed: config.fields.pressure.maximumSpeed,
    ambientSpeed: config.fields.ambient.speed,
    edgeRestLengthInfluence: config.memory.edgeRestLengthInfluence,
  };

  return [
    createScaledNumberBinding("edgeBrightness", 55, (scale) => {
      config.render.edgeOpacity = defaults.edgeOpacity * scale;
    }),
    createScaledNumberBinding("triangleVisibility", 20, (scale) => {
      config.render.triangleOpacity = defaults.triangleOpacity * scale;
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
      renderer: createWebglMembraneRenderer(canvas),
    };
  } catch (error) {
    console.error(
      "WebGL membrane renderer unavailable, falling back:",
      error,
    );

    // A canvas that has handed out a WebGL context cannot reliably
    // provide a 2D one afterwards, so swap in a fresh canvas first.
    const replacement = canvas.cloneNode(false) as HTMLCanvasElement;
    canvas.replaceWith(replacement);

    return {
      canvas: replacement,
      renderer: createCanvasRenderer(replacement),
    };
  }
}

export const breathingMembranePreset: PresetDefinition = {
  id: "breathing-membrane",
  aliases: ["membrane", "breathing-membrane"],
  displayName: "Breathing Membrane",
  description:
    "A quiet triangular membrane shaped by pressure, tension, and fading structural memory.",
  createConfig,
  createRenderer,
  topologyBuilder: delaunayTopologyBuilder,
  createPropertyBindings,
  simulationSystems: [
    resetForcesSystem,
    pressureFieldSystem,
    ambientDriftSystem,
    membraneWaveSystem,
    membranePulseSystem,
    springSystem,
    integrationSystem,
    geometrySystem,
    memorySystem,
    legacyMemorySystem,
  ],
  frameSystems: [pointerSmoothingSystem, revealSystem],
};
