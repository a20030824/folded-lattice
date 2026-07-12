import type { FoldedLatticeConfig } from "./config";
import type { SimulationState, TopologyState } from "./state";
import type { Viewport } from "./types";
import type { PropertyBinding } from "../wallpaper/properties";

export interface TopologyBuilder {
  build(viewport: Viewport, config: FoldedLatticeConfig): TopologyState;
}

export interface SimulationSystem {
  readonly name: string;
  update(
    state: SimulationState,
    config: FoldedLatticeConfig,
    deltaSeconds: number,
  ): void;
}

export interface FrameSystem {
  readonly name: string;
  updateFrame(
    state: SimulationState,
    config: FoldedLatticeConfig,
    deltaSeconds: number,
  ): void;
}

export interface Renderer {
  resize(viewport: Viewport, maximumDevicePixelRatio: number): void;
  render(
    state: Readonly<SimulationState>,
    config: Readonly<FoldedLatticeConfig>,
  ): void;
  dispose(): void;
}

export interface PresetRendererResult {
  canvas: HTMLCanvasElement;
  renderer: Renderer;
}

export interface PresetDefinition {
  id: string;
  aliases: readonly string[];
  displayName: string;
  description: string;

  createConfig(): FoldedLatticeConfig;

  createRenderer(
    canvas: HTMLCanvasElement,
    config: FoldedLatticeConfig,
  ): PresetRendererResult;

  applyMode?(
    config: FoldedLatticeConfig,
    mode: string | null,
  ): void;

  createPropertyBindings(config: FoldedLatticeConfig): PropertyBinding[];

  topologyBuilder: TopologyBuilder;
  simulationSystems: SimulationSystem[];
  frameSystems: FrameSystem[];
}
