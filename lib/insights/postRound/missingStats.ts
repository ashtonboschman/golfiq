import type { AdvancedStatKey, MissingStats } from '@/lib/insights/types';

type RoundLike = {
  firHit?: number | null;
  girHit?: number | null;
  putts?: number | null;
  penalties?: number | null;
};

const STAT_LABELS: Record<AdvancedStatKey, string> = {
  fir: 'FIR',
  gir: 'GIR',
  putts: 'putts',
  penalties: 'penalties',
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

export function formatMissingStatsList(missing: MissingStats): string {
  const labels = getMissingStatKeys(missing).map((key) => STAT_LABELS[key]);
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}
