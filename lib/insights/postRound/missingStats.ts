import type { AdvancedStatKey, MissingStats } from '@/lib/insights/types';

type RoundLike = {
  firHit?: number | null;
  girHit?: number | null;
  putts?: number | null;
  penalties?: number | null;
};

export function getMissingStats(round: RoundLike): MissingStats {
  return {
    fir: round.firHit == null,
    gir: round.girHit == null,
    putts: round.putts == null,
    penalties: round.penalties == null,
  };
}

export function getMissingStatKeys(missing: MissingStats): AdvancedStatKey[] {
  const keys: AdvancedStatKey[] = [];
  if (missing.fir) keys.push('fir');
  if (missing.gir) keys.push('gir');
  if (missing.putts) keys.push('putts');
  if (missing.penalties) keys.push('penalties');
  return keys;
}

export function getMissingCount(missing: MissingStats): number {
  return getMissingStatKeys(missing).length;
}
