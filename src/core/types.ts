export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 extends Vec2 {
  z: number;
}

export interface Viewport {
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface PointerState {
  position: Vec2;
  previousPosition: Vec2;
  velocity: Vec2;
  isInside: boolean;
  isDown: boolean;
  influence: number;
}

export interface TimeState {
  elapsed: number;
  delta: number;
  fixedDelta: number;
  frame: number;
}
