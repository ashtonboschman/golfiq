type VariantOffsetOptions = {
  forceRegenerate?: boolean;
  bumpVariant?: boolean;
};

export function resolvePostRoundVariantOffset(
  existingInsights: unknown,
  options?: VariantOffsetOptions,
): number {
  const raw = Number((existingInsights as any)?.variant_offset);
  const previousOffset =
    Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;

  if (options?.forceRegenerate === true && options?.bumpVariant === true) {
    return previousOffset + 1;
  }

  return previousOffset;
}

