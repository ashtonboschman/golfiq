import 'server-only';

import { hashReconciliationSnapshot } from './hash';
import { normalizeComparableTeeName, normalizeTeeName } from './normalize';
import type { MatchMethod, NormalizedProviderTee, ReconciliationGender } from './types';

export type MatchableLocalTee = {
  id: string;
  gender: ReconciliationGender;
  teeName: string;
  courseRating: number | null;
  slopeRating: number | null;
  numberOfHoles: number | null;
  holes: Array<{ holeNumber: number; par: number; yardage: number }>;
};

export type TeeMatch = {
  localTeeId: string;
  providerTeeKey: string;
  method: MatchMethod;
};

export function localScorecardSignature(tee: MatchableLocalTee): string {
  return hashReconciliationSnapshot({
    gender: tee.gender,
    courseRating: tee.courseRating,
    slopeRating: tee.slopeRating,
    numberOfHoles: tee.numberOfHoles,
    holes: tee.holes.map((hole) => ({
      holeNumber: hole.holeNumber,
      par: hole.par,
      yardage: hole.yardage,
    })),
  });
}

export function findConservativeTeeMatches(
  providerTees: NormalizedProviderTee[],
  localTees: MatchableLocalTee[],
  manualMatches: Map<string, string> = new Map(),
): { matches: TeeMatch[]; suggestions: Map<string, string[]> } {
  const matches: TeeMatch[] = [];
  const suggestions = new Map<string, string[]>();
  const usedLocalIds = new Set<string>();
  const usedProviderKeys = new Set<string>();

  for (const provider of providerTees) {
    const localId = manualMatches.get(provider.providerTeeKey);
    const local = localTees.find((tee) => tee.id === localId);
    if (local && local.gender === provider.gender && !usedLocalIds.has(local.id)) {
      matches.push({ localTeeId: local.id, providerTeeKey: provider.providerTeeKey, method: 'manual' });
      usedLocalIds.add(local.id);
      usedProviderKeys.add(provider.providerTeeKey);
    }
  }

  for (const provider of providerTees) {
    if (usedProviderKeys.has(provider.providerTeeKey)) continue;
    const candidates = localTees.filter((local) =>
      !usedLocalIds.has(local.id)
      && local.gender === provider.gender
      && normalizeTeeName(local.teeName) === provider.descriptor.normalizedName,
    );
    const providerNameCount = providerTees.filter((candidate) =>
      candidate.gender === provider.gender
      && candidate.descriptor.normalizedName === provider.descriptor.normalizedName,
    ).length;
    if (providerNameCount === 1 && candidates.length === 1) {
      matches.push({ localTeeId: candidates[0].id, providerTeeKey: provider.providerTeeKey, method: 'exact-name' });
      usedLocalIds.add(candidates[0].id);
      usedProviderKeys.add(provider.providerTeeKey);
    } else if (candidates.length) {
      suggestions.set(provider.providerTeeKey, candidates.map((candidate) => candidate.id));
    }
  }

  for (const provider of providerTees) {
    if (usedProviderKeys.has(provider.providerTeeKey)) continue;
    const candidates = localTees.filter((local) =>
      !usedLocalIds.has(local.id)
      && local.gender === provider.gender
      && localScorecardSignature(local) === provider.descriptor.signature,
    );
    if (candidates.length) {
      suggestions.set(provider.providerTeeKey, candidates.map((candidate) => candidate.id));
    }
  }

  for (const provider of providerTees) {
    if (usedProviderKeys.has(provider.providerTeeKey)) continue;
    const comparableName = normalizeComparableTeeName(provider.descriptor.rawName);
    const candidates = localTees.filter((local) =>
      !usedLocalIds.has(local.id)
      && local.gender === provider.gender
      && normalizeComparableTeeName(local.teeName) === comparableName,
    );
    if (candidates.length) {
      const existing = suggestions.get(provider.providerTeeKey) ?? [];
      suggestions.set(provider.providerTeeKey, Array.from(new Set([
        ...existing,
        ...candidates.map((candidate) => candidate.id),
      ])));
    }
  }

  return { matches, suggestions };
}
