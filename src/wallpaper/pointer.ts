import type { SimulationState } from "../core/state";

export function bindPointerInput(
  canvas: HTMLCanvasElement,
  getState: () => Readonly<SimulationState>,
): () => void {
  let lastMoveTime = performance.now();

  const updatePosition = (event: PointerEvent): void => {
    const state = getState() as SimulationState;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const now = performance.now();
    const deltaSeconds = Math.max(1 / 240, Math.min(0.1, (now - lastMoveTime) / 1000));
    state.pointer.previousPosition.x = state.pointer.position.x;
    state.pointer.previousPosition.y = state.pointer.position.y;
    state.pointer.position.x = x;
    state.pointer.position.y = y;
    state.pointer.velocity.x = (x - state.pointer.previousPosition.x) / deltaSeconds;
    state.pointer.velocity.y = (y - state.pointer.previousPosition.y) / deltaSeconds;
    state.pointer.isInside = true;
    lastMoveTime = now;
  };

  const onPointerDown = (event: PointerEvent): void => {
    updatePosition(event);
    const state = getState() as SimulationState;
    state.pointer.isDown = true;
    canvas.setPointerCapture?.(event.pointerId);
  };
  const onPointerUp = (event: PointerEvent): void => {
    const state = getState() as SimulationState;
    state.pointer.isDown = false;
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  const onPointerLeave = (): void => {
    const state = getState() as SimulationState;
    state.pointer.isInside = false;
    state.pointer.isDown = false;
  };
  const onContextMenu = (event: MouseEvent): void => event.preventDefault();

  canvas.addEventListener("pointermove", updatePosition);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("contextmenu", onContextMenu);

  return () => {
    canvas.removeEventListener("pointermove", updatePosition);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("contextmenu", onContextMenu);
  };
}
