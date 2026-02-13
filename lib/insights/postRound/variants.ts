import crypto from 'crypto';

type VariantOptions = {
  outcome: string;
  variants: readonly string[];
  seed?: string;
  offset?: number;
  fixedIndex?: number;
};

export type VariantPickResult = {
  text: string;
  index: number;
  count: number;
};

function safeIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  const normalized = index % length;
  return normalized < 0 ? normalized + length : normalized;
}

function resolveVariantIndex(options: VariantOptions): number {
  const { outcome, variants, seed, offset = 0, fixedIndex } = options;
  if (!variants.length) return 0;

  if (fixedIndex != null && Number.isFinite(fixedIndex)) {
    return safeIndex(Math.floor(fixedIndex), variants.length);
  }

  if (!seed) {
    return safeIndex(Math.floor(offset), variants.length);
  }

  const hash = crypto.createHash('sha256').update(`${seed}|${outcome}`).digest('hex');
  const base = parseInt(hash.slice(0, 8), 16);
  return safeIndex(base + Math.floor(offset), variants.length);
}

export function pickOutcomeVariantMeta(options: VariantOptions): VariantPickResult {
  const { variants } = options;
  if (!variants.length) {
    return { text: '', index: 0, count: 0 };
  }

  const index = resolveVariantIndex(options);
  return {
    text: variants[index] ?? '',
    index,
    count: variants.length,
  };
}

export function pickOutcomeVariant(options: VariantOptions): string {
  return pickOutcomeVariantMeta(options).text;
}
