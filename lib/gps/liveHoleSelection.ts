import type { LiveGpsMappedHole } from '@/lib/gps/liveMappingTypes';

export function selectLiveGpsMappedHoleForDraft(
  holes: LiveGpsMappedHole[],
  draft: { hole_number: number; display_hole_number: number },
) {
  return holes.find((hole) => hole.holeNumber === draft.hole_number) ?? null;
}
