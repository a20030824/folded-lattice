# Folded Lattice refactor baseline

## Scope and snapshot

This document records the architecture before the progressive refactor. It is
intended as a comparison point for later rounds; it does not prescribe any
runtime changes.

- Snapshot commit: `559087b15bf8ff019cba2084f8da4fd37a50a43a`
- Snapshot subject: `Switch Lively presets without reloading`
- Snapshot date: 2026-07-13
- Branch: `main`

The baseline contains four working presets:

- Breathing Membrane
- Crumpled Paper
- Wandering Ink
- Tide Archive

## Current engine contract

`src/core/contracts.ts` defines the current shared contracts:

- `TopologyBuilder.build(viewport, config)` creates a `TopologyState`.
- `SimulationSystem.update(state, config, deltaSeconds)` runs during fixed
  simulation updates.
- `FrameSystem.updateFrame(state, config, deltaSeconds)` runs once per rendered
  frame.
- `Renderer.resize(viewport, maximumDevicePixelRatio)`,
  `Renderer.render(state, config)`, and `Renderer.dispose()` own rendering.
- `PresetDefinition` currently contains `id`, `displayName`, `description`, a
  mutable `config`, one topology builder, and simulation/frame system arrays.

`src/core/createEngine.ts` currently exposes:

```ts
createEngine(
  preset: PresetDefinition,
  renderer: Renderer,
  initialViewport: Viewport,
): FoldedLatticeEngine
```

The engine reads `preset.config`, creates an empty simulation state, sets the
fixed timestep from `config.performance.fixedSimulationFps`, builds the initial
topology, and resizes the renderer. It then owns:

- the request-animation-frame loop and frame-rate limiting;
- fixed-step simulation updates through `preset.simulationSystems`;
- frame updates through `preset.frameSystems`;
- rendering;
- `start`, `stop`, `resize`, `rebuildTopology`, `getState`, and `dispose`.

`resize` updates the viewport, resizes the renderer, and rebuilds the topology.
`rebuildTopology` also clears fields and resets the fixed-step accumulator.
The engine does not branch on a preset id or renderer type, but it does receive
the complete preset definition and obtains the config from that definition.

## Current preset registry and selection flow

There is no `src/presets/registry.ts` yet. `src/app/main.ts` imports all four
preset definitions directly:

```text
main.ts
  resolvePreset(name)
    -> one of the four module-level preset definitions
  structuredClone(definition.config)
    -> per-runtime config copy
  applyInkMode(preset)
  createRendererFor(preset.id)
  createEngine(preset, renderer, viewport)
```

The `startPreset` function keeps the active runtime in `main.ts`. When the
selected preset id changes, it unbinds pointer input, removes the Lively
bridge, disposes the engine, replaces the canvas, clones the preset config,
applies the optional Wandering Ink mode, creates a renderer and engine, then
binds pointer input and installs the Lively bridge again. The switch happens
in place without a page reload.

The current resolver is a small conditional function:

| Input | Resolved preset |
| --- | --- |
| `ink` | Wandering Ink (`wandering-ink`) |
| `membrane` | Breathing Membrane (`breathing-membrane`) |
| `tide` or `archive` | Tide Archive (`tide-archive`) |
| `paper`, `null`, or any other value | Crumpled Paper (`crumpled-paper`) |

The canonical ids (`crumpled-paper`, `wandering-ink`,
`breathing-membrane`, and `tide-archive`) are not all accepted as URL names by
the current resolver: only `tide-archive`'s `tide`/`archive` aliases, `ink`,
and `membrane` are explicit branches. The paper branch is the fallback.

## Current preset composition

The following table records the topology builder, systems, renderer, and
preset-specific configuration/state currently used by each preset. System
names are the `name` values from their system modules.

| Preset | Topology builder | Fixed simulation systems | Frame systems | Renderer | Preset-specific config | Preset-specific runtime state |
| --- | --- | --- | --- | --- | --- | --- |
| Breathing Membrane | `delaunayTopologyBuilder` | `reset-forces`, `pressure-fields`, `ambient-drift`, `membrane-wave`, `membrane-pulse`, `springs`, `integration`, `geometry`, `structural-memory`, `legacy-memory` | `pointer-smoothing`, `stress-reveal` | WebGL membrane; Canvas fallback | `pulse`, `membraneWave`, `legacy`, and `render.colors.pulse` | `EdgeState.pulse`, `TriangleState.legacy`, and `SimulationState.legacyScratch` are used by the pulse/legacy systems; standard Delaunay topology otherwise |
| Crumpled Paper | `creaseTopologyBuilder` | `reset-forces`, `pressure-fields`, `ambient-drift`, `pointer-field`, `crease-life`, `springs`, `integration`, `geometry` | `pointer-smoothing` | WebGL paper; paper Canvas fallback | `crease` | `TopologyState.creaseField`, `TopologyState.creaseEdges`, and `NodeState.creaseTag` describe the living folds |
| Wandering Ink | `delaunayTopologyBuilder` | `reset-forces`, `wanderer`, `ink-wick`, `springs`, `integration`, `geometry`, `structural-memory` | `pointer-smoothing` | Ink Canvas renderer | `creature` and `render.colors.ink` | `SimulationState.creature`, `SimulationState.edgeInk`, and `SimulationState.inkWickScratch` are created/used by the wanderer and ink-wick systems |
| Tide Archive | `creaseTopologyBuilder` | `reset-forces`, `pressure-fields`, `ambient-drift`, `pointer-field`, `springs`, `integration`, `geometry`, `structural-memory` | `pointer-smoothing` | Contour Canvas renderer | `crease` and `contour` | Uses crease topology state; contour archive paths and chart marks are renderer-local rather than fields on `SimulationState` |

All presets also provide the shared `topology`, `physics`, `fields`, `memory`,
`reveal`, `render`, and `performance` sections of `FoldedLatticeConfig`.
Some presets fill shared sections with inert values because the current
contract is shared. The optional sections above are the current locations of
preset-specific module configuration.

## Renderer selection flow

`main.ts#createRendererFor` selects by preset id:

| Preset id | Primary renderer | Fallback |
| --- | --- | --- |
| `tide-archive` | `createContourRenderer(canvas)` | None; it is already Canvas-based |
| `wandering-ink` | `createInkRenderer(canvas)` | None; it is already Canvas-based |
| `breathing-membrane` | `createWebglMembraneRenderer(canvas)` | `createCanvasRenderer(replacementCanvas)` |
| `crumpled-paper` | `createWebglPaperRenderer(canvas)` | `createPaperRenderer(replacementCanvas)` |

The two WebGL branches catch renderer-construction failures. They clone and
replace the current canvas before constructing the Canvas renderer because a
canvas that has been given a WebGL context cannot reliably provide a 2D context
afterward. `main.ts` updates its module-level `canvas` variable to the
replacement. The renderer factories themselves return only a `Renderer`, not
the actual canvas element.

## Current Lively property flow

`src/wallpaper/lively.ts` installs a single global
`window.livelyPropertyListener`. It captures the active preset's baseline
values when the bridge is installed, so Lively values scale each preset's own
defaults.

| Lively property | Current effect |
| --- | --- |
| `preset` | Maps numeric values to `paper`, `ink`, `membrane`, or `tide`, then calls `main.ts`'s `selectPreset` callback |
| `edgeBrightness` | Scales `config.render.edgeOpacity` |
| `triangleVisibility` | Scales `config.render.triangleOpacity` |
| `nodeCount` | Changes `config.topology.nodeCount` and schedules a topology rebuild after 120 ms |
| `pressureStrength` | Scales pressure minimum/maximum strength |
| `pressureRadius` | Scales pressure minimum/maximum radius |
| `memoryStrength` | Scales edge rest-length memory influence and toggles memory |
| `motionSpeed` | Scales pressure and ambient speed |
| `mouseInteraction` | Toggles pointer-field enablement |
| `mouseStrength` | Scales pointer strength |
| `quality` | Changes maximum device pixel ratio and refreshes the renderer via `engine.resize` |
| `targetFps` | Selects 30 FPS for non-positive values, otherwise 60 FPS |

Removing the bridge clears its pending rebuild timer and deletes the global
listener. Preset switching performs that removal before installing a bridge
for the new config, so the active bridge follows the active preset.

## Runtime ownership outside the engine

`main.ts` retains the platform/runtime concerns around the engine:

- pointer binding and unbinding;
- Lively bridge installation and removal;
- debounced window resize;
- pausing on `document.visibilitychange` while the page is hidden;
- canvas replacement during preset switches and WebGL fallback;
- debug handles at `window.__engine` and `window.__config`;
- `beforeunload` cleanup.

The pointer is bound after renderer creation, so it currently targets the
latest canvas when a fallback or preset switch replaces the element.

## Known URL behavior and renderer fallback behavior

The currently supported manual URL forms are:

```text
/?preset=paper
/?preset=ink
/?preset=ink&mode=serpent
/?preset=ink&mode=hatchling
/?preset=membrane
/?preset=tide
/?preset=archive
```

Wandering Ink mode handling is currently in `main.ts`:

- `mode=serpent` sets the existing long/slow/thin values for trail count,
  base speed, ink width, and wander strength.
- `mode=hatchling` sets the existing short/quick/skittish values for trail
  count, base speed, ink width, pointer repel radius, and pointer speed boost.

The values are applied to a `structuredClone` of the module-level config for
the active runtime. WebGL failure remains recoverable through the fresh-canvas
replacement paths described above, and subsequent pointer binding uses the
replacement element.

