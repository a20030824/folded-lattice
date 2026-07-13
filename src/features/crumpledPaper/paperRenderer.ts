import {
  creaseConfigKey,
  type CreaseConfig,
} from "../crease/config";
import { creaseRuntimeKey } from "../crease/state";
import type { Renderer } from "../../core/contracts";
import { clamp, hash01, mixRgb, parseColor, rgbString } from "../../core/math";
import type { NodeState } from "../../core/state";
import type { Viewport } from "../../core/types";

const SHADE_STEPS = 48;

interface PaperPalette {
  key: string;
  shades: string[];
  ridge: string;
  background: string;
}

function buildPalette(settings: CreaseConfig, background: string): PaperPalette {
  const key = `${settings.paperShadow}|${settings.paperLit}|${settings.ridgeColor}|${background}`;
  const shadow = parseColor(settings.paperShadow);
  const lit = parseColor(settings.paperLit);
  const shades: string[] = [];
  for (let step = 0; step < SHADE_STEPS; step += 1) {
    shades.push(rgbString(mixRgb(shadow, lit, step / (SHADE_STEPS - 1))));
  }
  return {
    key,
    shades,
    ridge: rgbString(parseColor(settings.ridgeColor)),
    background,
  };
}

/**
 * A static fiber-grain tile composited with soft-light. Real paper texture
 * does not move with the sheet's gentle breathing, and a fixed tile costs
 * one pattern fill per frame.
 */
function buildGrainTile(seed: number): HTMLCanvasElement {
  const size = 192;
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const tileContext = tile.getContext("2d")!;
  const image = tileContext.createImageData(size, size);

  for (let index = 0; index < size * size; index += 1) {
    const noise = hash01(index * 31 + seed);
    const fiber = hash01(index * 7 + seed + 977);
    // Mostly neutral gray; occasional brighter fiber flecks.
    const value = 118 + noise * 20 + (fiber > 0.965 ? 26 : 0);
    image.data[index * 4] = value;
    image.data[index * 4 + 1] = value;
    image.data[index * 4 + 2] = value;
    image.data[index * 4 + 3] = 255;
  }

  tileContext.putImageData(image, 0, 0);
  return tile;
}

export function createPaperRenderer(canvas: HTMLCanvasElement): Renderer {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D is not available.");

  let viewport: Viewport = { width: 1, height: 1, devicePixelRatio: 1 };
  let palette: PaperPalette | null = null;
  let grainPattern: CanvasPattern | null = null;
  let grainSeed = 0;
  const vignette = document.createElement("canvas");
  let vignetteSize = "";

  const projectedX = (node: NodeState, depthProjection: number): number =>
    node.position.x + node.position.z * depthProjection;
  const projectedY = (node: NodeState, depthProjection: number): number =>
    node.position.y - node.position.z * depthProjection * 0.72;

  const paintVignette = (): void => {
    const scale = 0.25;
    const width = Math.max(2, Math.round(viewport.width * scale));
    const height = Math.max(2, Math.round(viewport.height * scale));
    vignette.width = width;
    vignette.height = height;
    const vignetteContext = vignette.getContext("2d")!;
    const gradient = vignetteContext.createRadialGradient(
      width * 0.5,
      height * 0.46,
      Math.min(width, height) * 0.35,
      width * 0.5,
      height * 0.5,
      Math.hypot(width, height) * 0.62,
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(0.7, "rgba(0,0,0,0.14)");
    gradient.addColorStop(1, "rgba(0,0,0,0.36)");
    vignetteContext.clearRect(0, 0, width, height);
    vignetteContext.fillStyle = gradient;
    vignetteContext.fillRect(0, 0, width, height);
  };

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
      vignetteSize = "";
    },

    render(state, config) {
      const settings = config.modules.get(creaseConfigKey);
      if (!settings) return;
      const runtime = state.resources.get(creaseRuntimeKey);
      if (!runtime) return;
      const { nodes, triangles, edges } = state.topology;
      const { creaseEdges } = runtime;
      const render = config.render;
      const seed = config.topology.randomSeed;

      if (!palette || palette.key !==
          `${settings.paperShadow}|${settings.paperLit}|${settings.ridgeColor}|${render.colors.background}`) {
        palette = buildPalette(settings, render.colors.background);
      }
      if (!grainPattern || grainSeed !== seed) {
        grainPattern = context.createPattern(buildGrainTile(seed), "repeat");
        grainSeed = seed;
      }
      const currentVignetteSize = `${viewport.width}x${viewport.height}`;
      if (vignetteSize !== currentVignetteSize) {
        paintVignette();
        vignetteSize = currentVignetteSize;
      }

      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      context.fillStyle = palette.background;
      context.fillRect(0, 0, viewport.width, viewport.height);

      // Light is environmental and fixed; only the sheet moves.
      const light = render.lightDirection;
      const lightLength = Math.max(
        1e-6,
        Math.hypot(light.x, light.y, light.z),
      );
      const lightX = light.x / lightLength;
      const lightY = light.y / lightLength;
      const lightZ = light.z / lightLength;
      const depthProjection = render.depthProjection;

      // Broad falloff across the sheet: facets nearer the light corner sit
      // a little brighter, the way a real lamp never lights a sheet evenly.
      const projections = [
        0,
        viewport.width * lightX,
        viewport.height * lightY,
        viewport.width * lightX + viewport.height * lightY,
      ];
      const projectionMin = Math.min(...projections);
      const projectionSpan = Math.max(1e-6, Math.max(...projections) - projectionMin);

      // The sheet itself: every facet, always. Paper is opaque.
      for (const triangle of triangles) {
        const a = nodes[triangle.nodeA];
        const b = nodes[triangle.nodeB];
        const c = nodes[triangle.nodeC];
        if (!a || !b || !c) continue;

        const lambert =
          triangle.normal.x * lightX +
          triangle.normal.y * lightY +
          Math.abs(triangle.normal.z) * lightZ;
        const falloff =
          (triangle.center.x * lightX + triangle.center.y * lightY - projectionMin) /
          projectionSpan;
        const albedoJitter = (hash01(triangle.id * 13 + seed) - 0.5) * 0.06;
        const shade = clamp(
          ((lambert - 0.35) * 1.7 + albedoJitter) * (0.86 + falloff * 0.28),
        );
        const index = Math.min(
          SHADE_STEPS - 1,
          Math.max(0, Math.round(shade * (SHADE_STEPS - 1))),
        );

        const ax = projectedX(a, depthProjection);
        const ay = projectedY(a, depthProjection);
        const bx = projectedX(b, depthProjection);
        const by = projectedY(b, depthProjection);
        const cx = projectedX(c, depthProjection);
        const cy = projectedY(c, depthProjection);

        context.fillStyle = palette.shades[index]!;
        context.strokeStyle = palette.shades[index]!;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(ax, ay);
        context.lineTo(bx, by);
        context.lineTo(cx, cy);
        context.closePath();
        context.fill();
        // Same-color stroke seals antialiasing seams between facets.
        context.stroke();
      }

      // Folds. Valleys hold shadow, ridges catch light; both fade as the
      // sheet locally flattens (dihedral angle -> 0) and sharpen under touch.
      for (const crease of creaseEdges) {
        const edge = edges[crease.edgeIndex];
        if (!edge) continue;
        const a = nodes[edge.nodeA];
        const b = nodes[edge.nodeB];
        if (!a || !b) continue;

        let foldFactor = 0.35;
        let facing = 0.5;
        if (crease.triangleA >= 0 && crease.triangleB >= 0) {
          const normalA = triangles[crease.triangleA]!.normal;
          const normalB = triangles[crease.triangleB]!.normal;
          const dot =
            normalA.x * normalB.x + normalA.y * normalB.y + normalA.z * normalB.z;
          foldFactor = clamp((1 - dot) * 3.2);
          const averageLambert =
            ((normalA.x + normalB.x) * lightX +
              (normalA.y + normalB.y) * lightY +
              (Math.abs(normalA.z) + Math.abs(normalB.z)) * lightZ) *
            0.5;
          facing = clamp(averageLambert);
        }

        const ax = projectedX(a, depthProjection);
        const ay = projectedY(a, depthProjection);
        const bx = projectedX(b, depthProjection);
        const by = projectedY(b, depthProjection);

        if (crease.sign < 0) {
          // Valley: a soft occlusion shadow pooled in the fold.
          context.globalAlpha =
            settings.valleyShadowStrength * crease.strength * (0.25 + foldFactor * 0.75) * 0.55;
          context.strokeStyle = "rgb(4,3,2)";
          context.lineWidth = 7 * crease.strength;
          context.beginPath();
          context.moveTo(ax, ay);
          context.lineTo(bx, by);
          context.stroke();

          context.globalAlpha =
            settings.valleyShadowStrength * crease.strength * (0.25 + foldFactor * 0.75);
          context.lineWidth = 1.6;
          context.beginPath();
          context.moveTo(ax, ay);
          context.lineTo(bx, by);
          context.stroke();
        } else {
          // Ridge: a thin lit line where the fold faces the light.
          context.globalAlpha =
            settings.ridgeLightStrength *
            crease.strength *
            foldFactor *
            (0.3 + facing * 0.7);
          context.strokeStyle = palette.ridge;
          context.lineWidth = 1.1;
          context.beginPath();
          context.moveTo(ax, ay);
          context.lineTo(bx, by);
          context.stroke();
        }
      }
      context.globalAlpha = 1;

      // Fiber grain over the whole sheet.
      if (grainPattern && settings.grainOpacity > 0) {
        context.globalCompositeOperation = "soft-light";
        context.globalAlpha = settings.grainOpacity;
        context.fillStyle = grainPattern;
        context.fillRect(0, 0, viewport.width, viewport.height);
        context.globalCompositeOperation = "source-over";
        context.globalAlpha = 1;
      }

      context.drawImage(vignette, 0, 0, viewport.width, viewport.height);
    },

    dispose() {
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
