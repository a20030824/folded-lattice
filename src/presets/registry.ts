import type { PresetDefinition } from "../core/contracts";
import { breathingMembranePreset } from "./breathingMembrane";
import { crumpledPaperPreset } from "./crumpledPaper";
import { tideArchivePreset } from "./tideArchive";
import { wanderingInkPreset } from "./wanderingInk";

const definitions: readonly PresetDefinition[] = [
  crumpledPaperPreset,
  wanderingInkPreset,
  breathingMembranePreset,
  tideArchivePreset,
];

const aliases = new Map<string, PresetDefinition>();
for (const definition of definitions) {
  aliases.set(definition.id, definition);
  for (const alias of definition.aliases) aliases.set(alias, definition);
}

export function resolvePreset(name: string | null): PresetDefinition {
  return (name && aliases.get(name)) || crumpledPaperPreset;
}
