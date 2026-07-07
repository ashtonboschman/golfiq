export function resolvePostRoundVariantOffset(existingInsights: unknown): number {
  const raw = Number((existingInsights as any)?.variant_offset);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
}
