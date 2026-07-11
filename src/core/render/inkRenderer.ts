import type { Renderer } from "../contracts";
import { clamp, mixRgb, parseColor, rgbString } from "../math";
import type { Rgb } from "../math";
import type { Viewport } from "../types";

/**
 * The relief is rasterized small and blurred up: facets melt into one
 * continuous pressed surface without adding a single triangle.
 */
const RELIEF_SCALE = 1 / 3;
const RELIEF_BLUR_PX = 5;

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
}

function buildPaletteKey(colors: {
  background: string;
  trianglePositive: string;
  triangleNegative: string;
  glow: string;
  ink?: string;
}): string {
  return [
    colors.background,
    colors.trianglePositive,
    colors.triangleNegative,
    colors.glow,
    colors.ink ?? "",
  ].join("|");
}

function buildPalette(colors: {
  background: string;
  trianglePositive: string;
  triangleNegative: string;
  glow: string;
  ink?: string;
}): Palette {
  const background = parseColor(colors.background, { r: 222, g: 215, b: 201 });
  const lit = parseColor(colors.trianglePositive);
  const shadow = parseColor(colors.triangleNegative);
  const lift = parseColor(colors.glow);
  const ink = parseColor(colors.ink ?? "#34425c");

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
    key: buildPaletteKey(colors),
    background,
    lift,
    // Shadows are never black here either: the vignette cools toward
    // the ink tint instead of darkening toward zero.
    vignette: rgbString(mixRgb(background, ink, 0.32)),
    shade,
    ink: inkRamp,
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
      const { nodes, triangles } = state.topology;
      const render = config.render;
      const colors = render.colors;

      if (!palette || palette.key !== buildPaletteKey(colors)) {
        palette = buildPalette(colors);
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
        // Relief melts away within a band of the border so hull slivers
        // never streak along the screen edge.
        const borderDistance = Math.min(
          triangle.center.x,
          triangle.center.y,
          viewport.width - triangle.center.x,
          viewport.height - triangle.center.y,
        );
        const borderLinear = clamp(borderDistance / 90);
        const borderFade = borderLinear * borderLinear;
        shadeScratch[triangle.id] =
          0.5 +
          (clamp(
            0.5 +
              (lambert - restLambert) * 3.4 +
              triangle.foldValue * 1.25 +
              triangle.memoryBias * 0.45,
          ) -
            0.5) *
            borderFade;
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

      // The settled creases: where the body passed long enough ago
      // that the crumple has relaxed, the gathered seam has dried
      // into a thin sharp fold line - the line's past is still a
      // line, faint but crisp, and it stays. Alpha ramps in as the
      // relief lets go, and eases out only at the very end of the
      // bounded trail.
      const creature = state.creature;
      if (creature && creature.creaseTrail.length > 1) {
        const trail = creature.creaseTrail;
        const now = state.time.elapsed;
        context.lineWidth = 0.8;
        let previous = trail[0]!;
        for (let index = 1; index < trail.length; index += 1) {
          const point = trail[index]!;
          const gap = Math.hypot(point.x - previous.x, point.y - previous.y);
          if (gap > 40) {
            previous = point;
            continue;
          }
          const age = now - point.bornAt;
          const settle = clamp((age - 18) / 55);
          if (settle <= 0.02) {
            previous = point;
            continue;
          }
          const endFade = Math.min(1, index / 260);
          const fade = 0.2 * settle * endFade;
          const inkIndex = Math.min(
            INK_LUT_STEPS - 1,
            Math.max(0, Math.round(fade * (INK_LUT_STEPS - 1))),
          );
          if (inkIndex > 0) {
            context.strokeStyle = palette.ink[inkIndex]!;
            context.beginPath();
            context.moveTo(previous.x, previous.y);
            context.lineTo(point.x, point.y);
            context.stroke();
          }
          previous = point;
        }
      }

      // The creature: one continuous brush stroke, tail melting into
      // the paper, width recorded from its pace when each point was laid.
      const creatureConfig = config.creature;
      if (creature && creatureConfig && creature.points.length > 1) {
        const shortSide = Math.max(
          1,
          Math.min(viewport.width, viewport.height),
        );
        const maximumWidth = creatureConfig.inkWidthRatio * shortSide;
        const points = creature.points;
        const count = points.length;

        // Old ink BLEEDS: fresh strokes are crisp, but toward the
        // tail the ink has had time to soak into the fibres - a wide
        // pale halo swells under the aging half of the body while the
        // core stays thin. Age blurs; the crease line will inherit
        // the sharpness.
        context.globalAlpha = 1;
        for (let index = 1; index < count; index += 1) {
          const arc = index / (count - 1);
          if (arc > 0.6) break;
          const bleed = (0.6 - arc) / 0.6;
          const from = points[index - 1]!;
          const to = points[index]!;
          const melt = clamp(arc / 0.18);
          const haloIndex = Math.round(
            (0.08 + 0.16 * melt) * (INK_LUT_STEPS - 1),
          );
          if (haloIndex === 0) continue;
          context.strokeStyle = palette.ink[haloIndex]!;
          context.lineWidth =
            maximumWidth * (1.1 + 3.4 * bleed) * to.widthFactor;
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(to.x, to.y);
          context.stroke();
        }

        for (let index = 1; index < count; index += 1) {
          const from = points[index - 1]!;
          const to = points[index]!;
          const arc = index / (count - 1);
          // Tail fades into paper over the first quarter of the body,
          // and its core thins as the bleed halo takes over the mass.
          const fade = clamp(arc / 0.25);
          const inkIndex = Math.min(
            INK_LUT_STEPS - 1,
            Math.max(0, Math.round(fade * (INK_LUT_STEPS - 1))),
          );
          if (inkIndex === 0) continue;
          const taper = clamp(arc / 0.06) * (0.55 + 0.45 * clamp((1 - arc) / 0.045));
          const soak = 1 - 0.45 * clamp((0.6 - arc) / 0.6);
          context.strokeStyle = palette.ink[inkIndex]!;
          context.lineWidth = Math.max(
            0.4,
            maximumWidth * to.widthFactor * taper * soak,
          );
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(to.x, to.y);
          context.stroke();
        }
        // No extra object at rest: the "puddle" is the line itself,
        // laid down thick while it winds into a coil (judge's call -
        // the earlier painted blot never read as part of the body).
      }

      context.globalAlpha = 1;
    },

    dispose() {
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
