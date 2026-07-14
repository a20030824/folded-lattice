import type { PresetDefinition } from "../core/contracts";
import { breathingMembranePreset } from "./breathingMembrane";
import { crumpledPaperPreset } from "./crumpledPaper";
import { tideArchivePreset } from "./tideArchive";
import { wanderingInkPreset } from "./wanderingInk";

export const presetDefinitions: readonly PresetDefinition[] = [
  crumpledPaperPreset,
  wanderingInkPreset,
  breathingMembranePreset,
  tideArchivePreset,
];

export const livelyPresetNames: readonly string[] = presetDefinitions.map(
  (definition) => {
    const alias = definition.aliases[0];
    if (!alias) {
      throw new Error(
        `Preset "${definition.id}" needs a primary alias for the Lively dropdown.`,
      );
    }
    return alias;
  },
);

function normalizePresetName(name: string): string {
  return name.trim().toLowerCase();
}

const aliases = new Map<string, PresetDefinition>();
function registerAlias(name: string, definition: PresetDefinition): void {
  const normalized = normalizePresetName(name);
  const existing = aliases.get(normalized);
  if (existing && existing !== definition) {
    throw new Error(
      `Preset alias "${name}" is shared by "${existing.id}" and "${definition.id}".`,
    );
  }
  aliases.set(normalized, definition);
}

for (const definition of presetDefinitions) {
  registerAlias(definition.id, definition);
  for (const alias of definition.aliases) registerAlias(alias, definition);
}

export function resolvePreset(name: string | null): PresetDefinition {
  if (name === null) return crumpledPaperPreset;

  const normalized = normalizePresetName(name);
  if (!normalized) return crumpledPaperPreset;

  const definition = aliases.get(normalized);
  if (definition) return definition;

  console.warn(
    `Unknown preset "${name}"; falling back to "${crumpledPaperPreset.id}".`,
  );
  return crumpledPaperPreset;
}
