# Standalone Lively packages

Folded Lattice keeps one shared application and publishes four independent Lively library items:

- Folded Lattice — Crumpled Paper
- Folded Lattice — Wandering Ink
- Folded Lattice — Breathing Membrane
- Folded Lattice — Tide Archive

The normal website remains a four-preset demo. Standalone packages are generated from the same `dist/` build and do not duplicate source code.

## Build

```bash
npm run build:lively
```

The command first builds the web application, then writes:

```text
lively-dist/
  crumpled-paper/
  wandering-ink/
  breathing-membrane/
  tide-archive/
  crumpled-paper.zip
  wandering-ink.zip
  breathing-membrane.zip
  tide-archive.zip
```

Each ZIP has the files Lively needs at its archive root, plus the project license required for redistribution:

```text
index.html
assets/
LivelyInfo.json
LivelyProperties.json
LICENSE
```

The generated `index.html` contains a `folded-lattice-preset` meta value. `src/app/packagePreset.ts` reads that value and constrains URL-driven preset changes to the package's fixed preset. The ordinary web build has no such meta value and therefore keeps the preset selector behavior.

## Package definitions

`lively-packages/manifest.json` is the source of truth for:

- package slug and fixed canonical preset id
- Lively library title and description
- tags
- the controls included in that package's `LivelyProperties.json`

The shared control definitions still live in `public/LivelyProperties.json`. A package only lists the keys it supports, so unsupported controls and the global preset dropdown do not appear in its customization panel.

When a package changes in a way that should replace an installed release, increment the top-level `version` in the manifest.

## License

The repository is released under the MIT License. `scripts/build-lively-packages.mjs` copies the root [`LICENSE`](../LICENSE) into every package unchanged, and CI compares the archived copy byte-for-byte with the repository source.

## CI artifacts

CI runs `npm run build:lively`, validates every ZIP with `unzip`, confirms the required root files and MIT license contents, and uploads all four archives as the `lively-packages` workflow artifact. This provides installable test packages without committing generated output.

## Artwork

`LivelyInfo.json` currently omits `Thumbnail` and `Preview`. Add final still images or preview clips to the package build only after each preset has approved artwork. The packaging script can then copy those files and add their relative names to the generated metadata.
