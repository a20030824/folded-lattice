export const packagedPresetMetaName = "folded-lattice-preset";

export function readPackagedPreset(
  documentRoot: Pick<Document, "querySelector"> = document,
): string | null {
  const content = documentRoot
    .querySelector<HTMLMetaElement>(
      `meta[name="${packagedPresetMetaName}"]`,
    )
    ?.content.trim();
  return content || null;
}

export function constrainPresetToPackage<T extends { preset: string | null }>(
  state: T,
  packagedPreset: string | null,
): T {
  if (!packagedPreset) return state;
  return { ...state, preset: packagedPreset };
}
