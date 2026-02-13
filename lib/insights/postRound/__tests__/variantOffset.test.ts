import { resolvePostRoundVariantOffset } from '@/lib/insights/postRound/variantOffset';

describe('resolvePostRoundVariantOffset', () => {
  it('defaults to 0 when there is no existing payload', () => {
    expect(resolvePostRoundVariantOffset(null)).toBe(0);
    expect(resolvePostRoundVariantOffset(undefined)).toBe(0);
  });

  it('uses persisted offset when valid', () => {
    expect(resolvePostRoundVariantOffset({ variant_offset: 3 })).toBe(3);
    expect(resolvePostRoundVariantOffset({ variant_offset: 3.9 })).toBe(3);
  });

  it('sanitizes invalid persisted values', () => {
    expect(resolvePostRoundVariantOffset({ variant_offset: -1 })).toBe(0);
    expect(resolvePostRoundVariantOffset({ variant_offset: 'bad' })).toBe(0);
  });

  it('increments only when forceRegenerate and bumpVariant are both true', () => {
    const existing = { variant_offset: 4 };
    expect(resolvePostRoundVariantOffset(existing, { forceRegenerate: true, bumpVariant: true })).toBe(5);
    expect(resolvePostRoundVariantOffset(existing, { forceRegenerate: true, bumpVariant: false })).toBe(4);
    expect(resolvePostRoundVariantOffset(existing, { forceRegenerate: false, bumpVariant: true })).toBe(4);
  });
});

