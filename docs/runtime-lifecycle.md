# Preset runtime lifecycle

The browser entry point and the preset runtime lifecycle are intentionally separate.

## Entry point

`src/app/main.ts` owns only browser-level wiring:

- locate the initial wallpaper canvas
- calculate the current viewport
- publish development debug handles after a runtime commits
- subscribe to URL state changes
- debounce resize events
- forward document visibility changes
- dispose subscriptions and the manager during unload

It does not create renderers, engines, pointer bindings, Lively bindings, or WebGL recovery handlers.

## Runtime manager

`src/app/presetRuntimeManager.ts` owns one active preset runtime at a time. A runtime contains:

- the committed canvas
- the preset config and effective mode
- the engine
- pointer and Lively adapter cleanup functions
- the WebGL context-recovery cleanup function

The manager exposes focused operations for preset selection, URL-state synchronization, resize, visibility, inspection, and disposal.

## Atomic preset switching

A switch is staged against a detached clone of the current canvas:

1. Resolve the preset and effective mode.
2. Create config and apply the mode.
3. Create the renderer, including WebGL initialization cleanup or Canvas fallback.
4. Create the engine and bind pointer input.
5. Install Lively property bindings and replay stored values.
6. Install WebGL context-loss recovery.
7. Start the candidate engine when the document is visible.
8. Replace the current canvas.
9. Publish the new runtime, then dispose the previous runtime.

If any staging step fails, only candidate resources are disposed. If the DOM commit fails, the complete candidate runtime is disposed. In both cases the previous canvas, engine, Lively listener, and animation loop remain active.

## Cleanup ownership

A committed runtime is disposed in this order:

1. remove WebGL context recovery
2. unbind pointer input
3. remove the Lively bridge
4. dispose the engine and renderer

Candidate rollback removes the staged WebGL recovery and Lively bridge before pointer input, then disposes the candidate engine or renderer. Cleanup errors are reported independently so one failing cleanup does not prevent the remaining resources from being released.

## Recovery and state continuity

The manager retains the shared Lively property-value store across preset and mode changes. WebGL context loss restarts the same preset atomically on a fresh canvas; repeated losses can force the preset's existing Canvas fallback. URL-driven mode and preset changes use the same switching path, so they receive the same rollback guarantees.
