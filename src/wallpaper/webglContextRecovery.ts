export function bindWebglContextRecovery(
  canvas: HTMLCanvasElement,
  recover: () => void,
): () => void {
  let active = true;
  let recoveryTimer: number | null = null;

  const onContextLost = (event: Event): void => {
    // Prevent the browser from treating the context as permanently lost while
    // the app replaces this canvas with a freshly staged renderer.
    event.preventDefault();

    if (!active || recoveryTimer !== null) return;
    recoveryTimer = window.setTimeout(() => {
      recoveryTimer = null;
      if (active) recover();
    }, 0);
  };

  canvas.addEventListener("webglcontextlost", onContextLost);

  return () => {
    if (!active) return;
    active = false;
    canvas.removeEventListener("webglcontextlost", onContextLost);
    if (recoveryTimer !== null) {
      window.clearTimeout(recoveryTimer);
      recoveryTimer = null;
    }
  };
}
