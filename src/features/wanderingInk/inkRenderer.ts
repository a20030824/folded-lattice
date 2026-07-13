import type { Renderer } from "../../core/contracts";
import { clamp, mixRgb, parseColor, rgbString, valueNoise2D } from "../../core/math";
import type { Rgb } from "../../core/math";
import type { Viewport } from "../../core/types";
import { getInkRuntime } from "./state";
import { creatureConfigKey } from "./config";

/**
 * The relief is rasterized small and blurred up: facets melt into one
 * continuous pressed surface without adding a single triangle.
 */
const RELIEF_SCALE = 1 / 3;
const RELIEF_BLUR_PX = 5;

/**
 * The wick field renders as ONE soft stain, far below display
 * resolution: individual fibres melt into a feathered wash and nothing
 * line-like survives. Absorbed ink is a damp blot on the paper, never
 * a drawn element - drawn elements at this size read as creatures.
 */
const STAIN_SCALE = 0.2;
/** Display-space blur of the composited stain. */
const STAIN_BLUR_PX = 4;
/** Ink below this level leaves no visible mark. */
const STAIN_FLOOR = 0.03;
/** Width of one wet fibre's swath, in display pixels. */
const STAIN_SWATH_PX = 14;
/** Ceiling on the stain's darkness over the paper. */
const STAIN_OPACITY = 0.22;

/**
 * Static paper grain, alpha-only: multiplied into the stain each frame
 * (destination-in) so the blot's fringe feathers along fixed fibres
 * instead of ending in a smooth vignette. Spatially frozen on purpose -
 * texture that moves reads as something alive.
 */
function paintGrain(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const image = context.createImageData(width, height);
  const data = image.data;
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const fine = valueNoise2D(x * 0.58, y * 0.58);
      const cloud = valueNoise2D(x * 0.13 + 91.7, y * 0.13 + 41.3);
      const fibre = clamp(fine * 0.55 + cloud * 0.45);
      data[offset + 0] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(70 + 185 * fibre * fibre);
      offset += 4;
    }
  }
  context.putImageData(image, 0, 0);
}

const SHADE_LUT_STEPS = 32;
const INK_LUT_STEPS = 14;

interface Palette {
  key: string;
  background: Rgb;
  lift: Rgb;
  vignette: string;
  /**
   * Relief tones, shade → paper → light; the midpoint is exactly the
   * paper color so flat terrain melts into the backdrop (full bleed).
   */
  shade: string[];
  /**
   * Tail fade of the creature, paper → ink.
   */
  ink: string[];
  /**
   * Full-strength ink for alpha-faded strokes: the colour never
   * shifts toward paper, only the opacity drops.
   */
  inkSolid: string;
}

function buildPaletteKey(
  colors: {
    background: string;
    trianglePositive: string;
    triangleNegative: string;
    glow: string;
  },
  inkColor: string | undefined,
): string {
  return [
    colors.background,
    colors.trianglePositive,
    colors.triangleNegative,
    colors.glow,
    inkColor ?? "",
  ].join("|");
}

function buildPalette(
  colors: {
    background: string;
    trianglePositive: string;
    triangleNegative: string;
    glow: string;
  },
  inkColor: string | undefined,
): Palette {
  const background = parseColor(colors.background, { r: 222, g: 215, b: 201 });
  const lit = parseColor(colors.trianglePositive);
  const shadow = parseColor(colors.triangleNegative);
  const lift = parseColor(colors.glow);
  const ink = parseColor(inkColor ?? "#34425c");

  const shade: string[] = [];
  for (let step = 0; step < SHADE_LUT_STEPS; step += 1) {
    const t = step / (SHADE_LUT_STEPS - 1);
    shade.push(
      t < 0.5
        ? rgbString(mixRgb(shadow, background, t * 2))
        : rgbString(mixRgb(background, lit, (t - 0.5) * 2)),
    );
  }

  const inkRamp: string[] = [];
  for (let step = 0; step < INK_LUT_STEPS; step += 1) {
    const t = step / (INK_LUT_STEPS - 1);
    inkRamp.push(rgbString(mixRgb(background, ink, t)));
  }

  return {
    key: buildPaletteKey(colors, inkColor),
    background,
    lift,
    // Shadows are never black here either: the vignette cools toward
    // the ink tint instead of darkening toward zero.
    vignette: rgbString(mixRgb(background, ink, 0.32)),
    shade,
    ink: inkRamp,
    inkSolid: rgbString(ink),
  };
}

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
  const context = backdrop.getContext("2d")!;

  const lifted = mixRgb(palette.background, palette.lift, clamp(centerLift));
  const radius = Math.hypot(width, height) * 0.62;
  const gradient = context.createRadialGradient(
    width * 0.5,
    height * 0.4,
    0,
    width * 0.5,
    height * 0.4,
    radius,
  );
  gradient.addColorStop(0, rgbString(lifted));
  gradient.addColorStop(0.6, rgbString(palette.background));
  gradient.addColorStop(1, rgbString(palette.background));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  if (vignetteStrength > 0) {
    const vignette = context.createRadialGradient(
      width * 0.5,
      height * 0.5,
      Math.min(width, height) * 0.46,
      width * 0.5,
      height * 0.5,
      radius,
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    const edge = parseColor(palette.vignette);
    vignette.addColorStop(
      1,
      `rgba(${edge.r | 0},${edge.g | 0},${edge.b | 0},${clamp(vignetteStrength)})`,
    );
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
  }
}

/**
 * Light-paper renderer for the wandering-ink preset. The mesh is never
 * drawn as lines or points: flat terrain is indistinguishable from the
 * backdrop, and only where the creature has dented the sheet do facets
 * surface as soft temperature relief. On top walks a single ink line.
 */
export function createInkRenderer(canvas: HTMLCanvasElement): Renderer {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D is not available.");

  let viewport: Viewport = { width: 1, height: 1, devicePixelRatio: 1 };
  let palette: Palette | null = null;
  const backdrop = document.createElement("canvas");
  let backdropKey = "";
  let shadeScratch = new Float32Array(0);
  const relief = document.createElement("canvas");
  const reliefContext = relief.getContext("2d")!;
  const tailSurface = document.createElement("canvas");
  const tailContext = tailSurface.getContext("2d")!;
  let renderPixelRatio = 1;
  const stain = document.createElement("canvas");
  const stainContext = stain.getContext("2d")!;
  const grain = document.createElement("canvas");
  const grainContext = grain.getContext("2d")!;

  return {
    resize(nextViewport, maximumDevicePixelRatio) {
      viewport = nextViewport;
      const pixelRatio = Math.min(
        Math.max(1, nextViewport.devicePixelRatio),
        maximumDevicePixelRatio,
      );
      renderPixelRatio = pixelRatio;
      canvas.width = Math.max(1, Math.round(nextViewport.width * pixelRatio));
      canvas.height = Math.max(1, Math.round(nextViewport.height * pixelRatio));
      canvas.style.width = `${nextViewport.width}px`;
      canvas.style.height = `${nextViewport.height}px`;
      tailSurface.width = canvas.width;
      tailSurface.height = canvas.height;
      tailContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.lineCap = "round";
      context.lineJoin = "round";
      backdropKey = "";
    },

    render(state, config) {
      const { nodes, triangles } = state.topology;
      const render = config.render;
      const colors = render.colors;
      const creatureConfig = config.modules.get(creatureConfigKey);
      const inkColor = creatureConfig?.color;

      if (!palette || palette.key !== buildPaletteKey(colors, inkColor)) {
        palette = buildPalette(colors, inkColor);
        backdropKey = "";
      }

      const atmosphere = render.atmosphere;
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

      // Terrain relief. Deviation from the flat-rest shade drives the
      // tone; flat facets are skipped entirely and stay pure paper.
      const light = render.lightDirection;
      const lightLength = Math.hypot(light.x, light.y, light.z) || 1;
      const lx = light.x / lightLength;
      const ly = light.y / lightLength;
      const lz = light.z / lightLength;
      // Lambert of the flat sheet; deviation from it is what we shade.
      const restLambert = lz;

      if (shadeScratch.length !== triangles.length) {
        shadeScratch = new Float32Array(triangles.length);
      }
      for (const triangle of triangles) {
        const lambert =
          triangle.normal.x * lx +
          triangle.normal.y * ly +
          Math.abs(triangle.normal.z) * lz;
        // With the overscanned sheet the hull lies outside the screen,
        // so the relief runs edge to edge - no frame, no border fade.
        shadeScratch[triangle.id] = clamp(
          0.5 +
            (lambert - restLambert) * 3.4 +
            triangle.foldValue * 1.25 +
            triangle.memoryBias * 0.45,
        );
      }

      // Facets are painted small, then blurred up onto the paper: one
      // continuous pressed surface, no readable triangle edges.
      const reliefWidth = Math.max(2, Math.round(viewport.width * RELIEF_SCALE));
      const reliefHeight = Math.max(2, Math.round(viewport.height * RELIEF_SCALE));
      if (relief.width !== reliefWidth || relief.height !== reliefHeight) {
        relief.width = reliefWidth;
        relief.height = reliefHeight;
      }
      reliefContext.setTransform(RELIEF_SCALE, 0, 0, RELIEF_SCALE, 0, 0);
      reliefContext.clearRect(0, 0, viewport.width, viewport.height);

      for (const triangle of triangles) {
        // Blend with the neighbouring facets before rasterizing.
        let shadeValue = shadeScratch[triangle.id]!;
        const neighbors = triangle.neighborIndices;
        if (neighbors.length > 0) {
          let neighborSum = 0;
          for (const neighborIndex of neighbors) {
            neighborSum += shadeScratch[neighborIndex] ?? 0.5;
          }
          shadeValue =
            shadeValue * 0.52 + (neighborSum / neighbors.length) * 0.48;
        }
        if (Math.abs(shadeValue - 0.5) < 0.015) continue;
        const a = nodes[triangle.nodeA];
        const b = nodes[triangle.nodeB];
        const c = nodes[triangle.nodeC];
        if (!a || !b || !c) continue;
        // Boundary slivers between two pinned hull nodes read as smears
        // along the border; they are frame, not terrain.
        if ((a.pinned ? 1 : 0) + (b.pinned ? 1 : 0) + (c.pinned ? 1 : 0) >= 2) {
          continue;
        }

        const lutIndex = Math.min(
          SHADE_LUT_STEPS - 1,
          Math.max(0, Math.round(shadeValue * (SHADE_LUT_STEPS - 1))),
        );
        reliefContext.fillStyle = palette.shade[lutIndex]!;
        reliefContext.beginPath();
        reliefContext.moveTo(a.position.x, a.position.y);
        reliefContext.lineTo(b.position.x, b.position.y);
        reliefContext.lineTo(c.position.x, c.position.y);
        reliefContext.closePath();
        reliefContext.fill();
      }

      context.globalAlpha = render.triangleOpacity;
      context.filter = `blur(${RELIEF_BLUR_PX}px)`;
      context.drawImage(relief, 0, 0, viewport.width, viewport.height);
      context.filter = "none";
      context.globalAlpha = 1;

      // The soaked ground: ink that left the body wicks outward along
      // the paper's fibre web (inkWick), and the whole field is pressed
      // into ONE soft stain. A damp blot with a feathered, grain-mottled
      // fringe - no strand, no line, nothing that could read as a body.
      // The field evolves continuously, so the wash cannot flicker.
      const runtime = getInkRuntime(state);
      const edgeInk = runtime.edgeInk;
      const creature = runtime.creature;
      if (edgeInk && edgeInk.length === state.topology.edges.length) {
        const stainWidth = Math.max(
          2,
          Math.round(viewport.width * STAIN_SCALE),
        );
        const stainHeight = Math.max(
          2,
          Math.round(viewport.height * STAIN_SCALE),
        );
        if (stain.width !== stainWidth || stain.height !== stainHeight) {
          stain.width = stainWidth;
          stain.height = stainHeight;
          grain.width = stainWidth;
          grain.height = stainHeight;
          paintGrain(grainContext, stainWidth, stainHeight);
        }
        stainContext.setTransform(STAIN_SCALE, 0, 0, STAIN_SCALE, 0, 0);
        stainContext.clearRect(0, 0, viewport.width, viewport.height);
        stainContext.strokeStyle = palette.inkSolid;
        stainContext.lineCap = "round";
        stainContext.lineWidth = STAIN_SWATH_PX;

        const edges = state.topology.edges;
        for (let index = 0; index < edges.length; index += 1) {
          const level = edgeInk[index]!;
          if (level < STAIN_FLOOR) continue;
          const edge = edges[index]!;
          const a = nodes[edge.nodeA];
          const b = nodes[edge.nodeB];
          if (!a || !b || (a.pinned && b.pinned)) continue;
          stainContext.globalAlpha = Math.min(0.42, level * 0.5);
          stainContext.beginPath();
          stainContext.moveTo(a.position.x, a.position.y);
          stainContext.lineTo(b.position.x, b.position.y);
          stainContext.stroke();
        }

        // Feather the fringe with the paper's own (static) grain.
        stainContext.setTransform(1, 0, 0, 1, 0, 0);
        stainContext.globalAlpha = 1;
        stainContext.globalCompositeOperation = "destination-in";
        stainContext.drawImage(grain, 0, 0);
        stainContext.globalCompositeOperation = "source-over";

        context.globalAlpha = STAIN_OPACITY;
        context.filter = `blur(${STAIN_BLUR_PX}px)`;
        context.drawImage(stain, 0, 0, viewport.width, viewport.height);
        context.filter = "none";
        context.globalAlpha = 1;
      }
      context.globalAlpha = 1;
      // The creature: one continuous brush stroke, tail melting into
      // the paper, width recorded from its pace when each point was laid.
      if (creature && creatureConfig && creature.points.length > 1) {
        const shortSide = Math.max(
          1,
          Math.min(viewport.width, viewport.height),
        );
        const maximumWidth = creatureConfig.inkWidthRatio * shortSide;
        const points = creature.points;
        const count = points.length;
        const tailEndIndex = Math.min(
          count - 1,
          Math.max(1, Math.floor((count - 1) * 0.25)),
        );

        // Draw the fade per segment, using progress along the sampled
        // body as the arc-length axis. A start-to-end linear gradient
        // degenerates when a curled tail's endpoints nearly coincide.
        tailContext.setTransform(
          renderPixelRatio,
          0,
          0,
          renderPixelRatio,
          0,
          0,
        );
        tailContext.clearRect(0, 0, viewport.width, viewport.height);
        tailContext.globalAlpha = 1;
        tailContext.globalCompositeOperation = "source-over";
        tailContext.strokeStyle = palette.inkSolid;
        tailContext.lineCap = "round";
        tailContext.lineJoin = "round";

        for (let index = 1; index <= tailEndIndex; index += 1) {
          const from = points[index - 1]!;
          const to = points[index]!;
          // 0 at the tail tip, 1 where the tail joins the body.
          const tailProgress = index / tailEndIndex;
          // Smooth thin-to-thick ramp along the tail.
          const tailWidthTaper =
            tailProgress * tailProgress * (3 - 2 * tailProgress);
          tailContext.globalAlpha = tailWidthTaper;
          const bodyArc = index / (count - 1);
          // Same head-sharpening rule as the body stroke below.
          const headTaper = 0.55 + 0.45 * clamp((1 - bodyArc) / 0.045);
          tailContext.lineWidth = Math.max(
            0.4,
            maximumWidth * to.widthFactor * tailWidthTaper * headTaper,
          );
          tailContext.beginPath();
          tailContext.moveTo(from.x, from.y);
          tailContext.lineTo(to.x, to.y);
          tailContext.stroke();
        }

        // The finished translucent tail lands on the main canvas.
        context.globalAlpha = 1;
        context.drawImage(tailSurface, 0, 0, viewport.width, viewport.height);

        // The body proper, straight onto the main canvas from the raw
        // points and their recorded widthFactor.
        context.globalAlpha = 1;
        context.strokeStyle = palette.inkSolid;
        context.lineCap = "round";
        context.lineJoin = "round";
        for (let index = tailEndIndex + 1; index < count; index += 1) {
          const from = points[index - 1]!;
          const to = points[index]!;
          const arc = index / (count - 1);
          const taper =
            clamp(arc / 0.06) * (0.55 + 0.45 * clamp((1 - arc) / 0.045));
          context.lineWidth = Math.max(
            0.4,
            maximumWidth * to.widthFactor * taper,
          );
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(to.x, to.y);
          context.stroke();
        }
        context.globalAlpha = 1;
      }

      context.globalAlpha = 1;
    },

    dispose() {
      canvas.width = 1;
      canvas.height = 1;
      relief.width = 1;
      relief.height = 1;
      tailSurface.width = 1;
      tailSurface.height = 1;
      stain.width = 1;
      stain.height = 1;
      grain.width = 1;
      grain.height = 1;
    },
  };
}
