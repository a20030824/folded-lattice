import type { Renderer } from "../contracts";
import { clamp, mixRgb, parseColor, rgbString } from "../math";
import type { Rgb } from "../math";
import type { NodeState } from "../state";
import type { Viewport } from "../types";

const TRIANGLE_LUT_STEPS = 24;
const EDGE_LUT_STEPS = 16;

interface Palette {
  key: string;
  background: Rgb;
  glow: Rgb;
  /**
   * Fold shading, indexed by quantized (fold+light) mix: negative → positive.
   */
  triangleFill: string[];
  /**
   * Edge color ramp from resting tone toward highlight tone.
   */
  edgeStroke: string[];
  edgeHighlight: string;
  glint: string;
  /**
   * Warm "now" color of a travelling pulse; null disables the pass.
   */
  pulse: string | null;
}

function buildPalette(colors: {
  background: string;
  edge: string;
  edgeHighlight: string;
  trianglePositive: string;
  triangleNegative: string;
  glow: string;
  pulse?: string;
}): Palette {
  const key = buildPaletteKey(colors);

  const background = parseColor(colors.background, { r: 10, g: 14, b: 19 });
  const glow = parseColor(colors.glow, { r: 120, g: 160, b: 175 });
  const negative = parseColor(colors.triangleNegative);
  const positive = parseColor(colors.trianglePositive);
  const edge = parseColor(colors.edge);
  const highlight = parseColor(colors.edgeHighlight);

  const triangleFill: string[] = [];
  for (let step = 0; step < TRIANGLE_LUT_STEPS; step += 1) {
    const t = step / (TRIANGLE_LUT_STEPS - 1);
    triangleFill.push(rgbString(mixRgb(negative, positive, t)));
  }

  const edgeStroke: string[] = [];
  for (let step = 0; step < EDGE_LUT_STEPS; step += 1) {
    const t = step / (EDGE_LUT_STEPS - 1);
    edgeStroke.push(rgbString(mixRgb(edge, highlight, t * 0.7)));
  }

  return {
    key,
    background,
    glow,
    triangleFill,
    edgeStroke,
    edgeHighlight: rgbString(highlight),
    glint: rgbString(mixRgb(highlight, { r: 255, g: 255, b: 255 }, 0.4)),
    pulse: colors.pulse ? rgbString(parseColor(colors.pulse)) : null,
  };
}

/**
 * Pre-rendered radial glow sprite tinted with the palette glow color.
 */
function buildGlowSprite(glow: Rgb): HTMLCanvasElement {
  const size = 256;
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const spriteContext = sprite.getContext("2d")!;
  const gradient = spriteContext.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, `rgba(${glow.r | 0},${glow.g | 0},${glow.b | 0},1)`);
  gradient.addColorStop(0.45, `rgba(${glow.r | 0},${glow.g | 0},${glow.b | 0},0.28)`);
  gradient.addColorStop(1, `rgba(${glow.r | 0},${glow.g | 0},${glow.b | 0},0)`);
  spriteContext.fillStyle = gradient;
  spriteContext.fillRect(0, 0, size, size);
  return sprite;
}

/**
 * Static background: base color lifted slightly toward the glow tint near
 * the upper center, then a soft vignette. Rebuilt on resize or recolor.
 */
function paintBackdrop(
  backdrop: HTMLCanvasElement,
  viewport: Viewport,
  palette: Palette,
  centerLift: number,
  vignetteStrength: number,
): void {
  const scale = 0.25;
  const width = Math.max(2, Math.round(viewport.width * scale));
  const height = Math.max(2, Math.round(viewport.height * scale));
  backdrop.width = width;
  backdrop.height = height;
  const backdropContext = backdrop.getContext("2d")!;

  const lifted = mixRgb(palette.background, palette.glow, clamp(centerLift));
  const radius = Math.hypot(width, height) * 0.62;
  const gradient = backdropContext.createRadialGradient(
    width * 0.5,
    height * 0.42,
    0,
    width * 0.5,
    height * 0.42,
    radius,
  );
  gradient.addColorStop(0, rgbString(lifted));
  gradient.addColorStop(0.55, rgbString(palette.background));
  gradient.addColorStop(1, rgbString(palette.background, 0.72));
  backdropContext.fillStyle = gradient;
  backdropContext.fillRect(0, 0, width, height);

  if (vignetteStrength > 0) {
    const vignette = backdropContext.createRadialGradient(
      width * 0.5,
      height * 0.5,
      Math.min(width, height) * 0.42,
      width * 0.5,
      height * 0.5,
      radius,
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, `rgba(0,0,0,${clamp(vignetteStrength)})`);
    backdropContext.fillStyle = vignette;
    backdropContext.fillRect(0, 0, width, height);
  }
}

export function createCanvasRenderer(canvas: HTMLCanvasElement): Renderer {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D is not available.");

  let viewport: Viewport = { width: 1, height: 1, devicePixelRatio: 1 };
  let palette: Palette | null = null;
  let glowSprite: HTMLCanvasElement | null = null;
  const backdrop = document.createElement("canvas");
  let backdropKey = "";

  const projectedX = (node: NodeState, depthProjection: number): number =>
    node.position.x + node.position.z * depthProjection;
  const projectedY = (node: NodeState, depthProjection: number): number =>
    node.position.y - node.position.z * depthProjection * 0.72;

  return {
    resize(nextViewport, maximumDevicePixelRatio) {
      viewport = nextViewport;
      const pixelRatio = Math.min(
        Math.max(1, nextViewport.devicePixelRatio),
        maximumDevicePixelRatio,
      );
      canvas.width = Math.max(1, Math.round(nextViewport.width * pixelRatio));
      canvas.height = Math.max(1, Math.round(nextViewport.height * pixelRatio));
      canvas.style.width = `${nextViewport.width}px`;
      canvas.style.height = `${nextViewport.height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.lineCap = "round";
      context.lineJoin = "round";
      backdropKey = "";
    },

    render(state, config) {
      const { nodes, edges, triangles } = state.topology;
      const render = config.render;
      const atmosphere = render.atmosphere;
      const maximumDepth = Math.max(
        1,
        Math.min(viewport.width, viewport.height) * config.physics.maximumDepthRatio,
      );
      const structureThreshold = config.reveal.structureVisibilityThreshold;
      const structureFloor = config.reveal.structureVisibilityFloor ?? 0;
      const visibleStructure = (visibility: number): number => {
        if (structureThreshold === undefined) return visibility;
        if (visibility <= structureThreshold) return structureFloor;
        const transition = clamp(
          (visibility - structureThreshold) / Math.max(0.001, structureThreshold * 0.55),
        );
        return structureFloor + (visibility - structureFloor) * transition;
      };

      if (!palette || palette.key !== buildPaletteKey(render.colors)) {
        palette = buildPalette(render.colors);
        glowSprite = buildGlowSprite(palette.glow);
        backdropKey = "";
      }

      const nextBackdropKey =
        `${viewport.width}x${viewport.height}|${palette.key}|` +
        `${atmosphere.centerLift}|${atmosphere.vignetteStrength}`;
      if (backdropKey !== nextBackdropKey) {
        paintBackdrop(
          backdrop,
          viewport,
          palette,
          atmosphere.centerLift,
          atmosphere.vignetteStrength,
        );
        backdropKey = nextBackdropKey;
      }

      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      context.drawImage(backdrop, 0, 0, viewport.width, viewport.height);

      // Breathing glow under pressure fields and the pointer.
      if (glowSprite && atmosphere.fieldGlowOpacity > 0) {
        context.globalCompositeOperation = "lighter";
        for (const field of state.fields) {
          if (!field.active || field.kind !== "pressure") continue;
          const pulse = 0.75 + 0.25 * Math.sin(field.age * 0.35 + field.seed);
          const alpha =
            atmosphere.fieldGlowOpacity *
            pulse *
            (field.polarity > 0 ? 1 : 0.4);
          const radius = field.radius * atmosphere.fieldGlowScale;
          context.globalAlpha = alpha;
          context.drawImage(
            glowSprite,
            field.position.x - radius,
            field.position.y - radius,
            radius * 2,
            radius * 2,
          );
        }

        context.globalCompositeOperation = "source-over";
      }

      // Membrane faces: fold + lambert light picks a tone from the LUT.
      const light = render.lightDirection;
      for (const triangle of triangles) {
        if (triangle.visibility < 0.004) continue;
        const a = nodes[triangle.nodeA];
        const b = nodes[triangle.nodeB];
        const c = nodes[triangle.nodeC];
        if (!a || !b || !c) continue;

        const lambert = clamp(
          triangle.normal.x * light.x +
            triangle.normal.y * light.y +
            Math.abs(triangle.normal.z) * light.z,
          -1,
          1,
        );
        const fold = clamp(
          (triangle.foldValue + triangle.memoryBias) * 0.5 + 0.5 + lambert * 0.28,
        );
        const lutIndex = Math.min(
          TRIANGLE_LUT_STEPS - 1,
          Math.max(0, Math.round(fold * (TRIANGLE_LUT_STEPS - 1))),
        );

        context.globalAlpha =
          render.triangleOpacity * triangle.visibility * (0.7 + lambert * 0.3);
        context.fillStyle = palette.triangleFill[lutIndex]!;
        context.beginPath();
        context.moveTo(projectedX(a, render.depthProjection), projectedY(a, render.depthProjection));
        context.lineTo(projectedX(b, render.depthProjection), projectedY(b, render.depthProjection));
        context.lineTo(projectedX(c, render.depthProjection), projectedY(c, render.depthProjection));
        context.closePath();
        context.fill();
      }

      // Edges: tension warms the tone, depth toward the eye lifts the alpha.
      for (const edge of edges) {
        const edgeVisibility = visibleStructure(edge.visibility);
        if (edgeVisibility < 0.001) continue;
        const a = nodes[edge.nodeA];
        const b = nodes[edge.nodeB];
        if (!a || !b) continue;

        const tensionMix = clamp(edge.tension * 10 + edge.memory * 0.5);
        const lutIndex = Math.min(
          EDGE_LUT_STEPS - 1,
          Math.round(tensionMix * (EDGE_LUT_STEPS - 1)),
        );
        const depth = clamp(
          ((a.position.z + b.position.z) * 0.5) / maximumDepth,
          -1,
          1,
        );

        context.globalAlpha =
          render.edgeOpacity * edgeVisibility * (0.82 + depth * 0.18);
        context.strokeStyle = palette.edgeStroke[lutIndex]!;
        context.lineWidth =
          render.edgeMinimumWidth +
          (render.edgeMaximumWidth - render.edgeMinimumWidth) * tensionMix;
        context.beginPath();
        context.moveTo(projectedX(a, render.depthProjection), projectedY(a, render.depthProjection));
        context.lineTo(projectedX(b, render.depthProjection), projectedY(b, render.depthProjection));
        context.stroke();
      }

      // Rare highlights: a wide soft pass under a bright core reads as glow.
      context.strokeStyle = palette.edgeHighlight;
      for (const edge of edges) {
        if (edge.highlight < 0.02) continue;
        const a = nodes[edge.nodeA];
        const b = nodes[edge.nodeB];
        if (!a || !b) continue;

        const ax = projectedX(a, render.depthProjection);
        const ay = projectedY(a, render.depthProjection);
        const bx = projectedX(b, render.depthProjection);
        const by = projectedY(b, render.depthProjection);

        context.globalAlpha = render.highlightOpacity * edge.highlight * 0.22;
        context.lineWidth = render.edgeMaximumWidth * 3.2;
        context.beginPath();
        context.moveTo(ax, ay);
        context.lineTo(bx, by);
        context.stroke();

        context.globalAlpha = render.highlightOpacity * edge.highlight;
        context.lineWidth = render.edgeMaximumWidth * 0.9;
        context.beginPath();
        context.moveTo(ax, ay);
        context.lineTo(bx, by);
        context.stroke();
      }

      // Travelling pulse: the warm front reads as "now" against the cool
      // membrane; the trace it leaves behind is ordinary edge memory.
      if (palette.pulse) {
        context.strokeStyle = palette.pulse;
        for (const edge of edges) {
          if (edge.pulse < 0.02) continue;
          const a = nodes[edge.nodeA];
          const b = nodes[edge.nodeB];
          if (!a || !b) continue;

          const ax = projectedX(a, render.depthProjection);
          const ay = projectedY(a, render.depthProjection);
          const bx = projectedX(b, render.depthProjection);
          const by = projectedY(b, render.depthProjection);

          context.globalAlpha = edge.pulse * 0.14;
          context.lineWidth = render.edgeMaximumWidth * 4.2;
          context.beginPath();
          context.moveTo(ax, ay);
          context.lineTo(bx, by);
          context.stroke();

          context.globalAlpha = edge.pulse * 0.8;
          context.lineWidth = render.edgeMaximumWidth * 1.1;
          context.beginPath();
          context.moveTo(ax, ay);
          context.lineTo(bx, by);
          context.stroke();
        }
      }

      // Dew: tiny points where several visible edges meet.
      if (atmosphere.nodeGlintOpacity > 0) {
        context.fillStyle = palette.glint;
        for (const node of nodes) {
          if (node.edgeIndices.length < 3) continue;
          let visibilitySum = 0;
          for (const edgeIndex of node.edgeIndices) {
            visibilitySum += edges[edgeIndex]?.visibility ?? 0;
          }
          const glint = visibilitySum / node.edgeIndices.length;
          const visibleGlint = visibleStructure(glint);
          if (structureThreshold === undefined) {
            if (glint < 0.22) continue;
            context.globalAlpha =
              atmosphere.nodeGlintOpacity * clamp((glint - 0.22) * 2.2);
          } else {
            if (visibleGlint <= structureFloor + 0.001) continue;
            context.globalAlpha =
              atmosphere.nodeGlintOpacity * clamp(visibleGlint * 1.8);
          }
          context.beginPath();
          context.arc(
            projectedX(node, render.depthProjection),
            projectedY(node, render.depthProjection),
            1.1,
            0,
            Math.PI * 2,
          );
          context.fill();
        }
      }

      context.globalAlpha = 1;
    },

    dispose() {
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}

function buildPaletteKey(colors: {
  background: string;
  edge: string;
  edgeHighlight: string;
  trianglePositive: string;
  triangleNegative: string;
  glow: string;
  pulse?: string;
}): string {
  return [
    colors.background,
    colors.edge,
    colors.edgeHighlight,
    colors.trianglePositive,
    colors.triangleNegative,
    colors.glow,
    colors.pulse ?? "",
  ].join("|");
}
