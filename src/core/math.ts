export function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function damp(
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
): number {
  return current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));
}

export function hash01(value: number): number {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 4_294_967_295;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function latticeHash(x: number, y: number): number {
  return hash01(Math.imul(x, 374_761_393) + Math.imul(y, 668_265_263));
}

/**
 * Smooth value noise in [0, 1]; inputs are in lattice cells.
 */
export function valueNoise2D(x: number, y: number): number {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const fractionX = x - cellX;
  const fractionY = y - cellY;
  const blendX = fractionX * fractionX * (3 - 2 * fractionX);
  const blendY = fractionY * fractionY * (3 - 2 * fractionY);

  const topLeft = latticeHash(cellX, cellY);
  const topRight = latticeHash(cellX + 1, cellY);
  const bottomLeft = latticeHash(cellX, cellY + 1);
  const bottomRight = latticeHash(cellX + 1, cellY + 1);

  const top = topLeft + (topRight - topLeft) * blendX;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * blendX;
  return top + (bottom - top) * blendY;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseColor(color: string, fallback: Rgb = { r: 255, g: 255, b: 255 }): Rgb {
  const hex = color.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return {
      r: parseInt(hex[0]! + hex[0]!, 16),
      g: parseInt(hex[1]! + hex[1]!, 16),
      b: parseInt(hex[2]! + hex[2]!, 16),
    };
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  return fallback;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

export function rgbString(color: Rgb, brightness = 1): string {
  const r = Math.round(clamp(color.r * brightness, 0, 255));
  const g = Math.round(clamp(color.g * brightness, 0, 255));
  const b = Math.round(clamp(color.b * brightness, 0, 255));
  return `rgb(${r},${g},${b})`;
}

export function createRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}
