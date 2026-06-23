export type LiveRoundTrackingPrefs = {
  fir: boolean;
  gir: boolean;
  chips: boolean;
  greensideBunkerShots: boolean;
  putts: boolean;
  penalties: boolean;
};

export type LiveRoundTrackingProfileFields = {
  live_round_track_fir?: boolean | null;
  live_round_track_gir?: boolean | null;
  live_round_track_chips?: boolean | null;
  live_round_track_greenside_bunker_shots?: boolean | null;
  live_round_track_putts?: boolean | null;
  live_round_track_penalties?: boolean | null;
};

export type LiveRoundAggregateField =
  | 'fir_hit'
  | 'gir_hit'
  | 'chips'
  | 'greenside_bunker_shots'
  | 'putts'
  | 'penalties';

export type LiveRoundAggregateHole = Partial<Record<LiveRoundAggregateField, number | null>>;

export const DEFAULT_LIVE_ROUND_TRACKING_PREFS: LiveRoundTrackingPrefs = {
  fir: true,
  gir: true,
  chips: true,
  greensideBunkerShots: true,
  putts: true,
  penalties: true,
};

export const LIVE_ROUND_TRACKING_SETTINGS = [
  {
    key: 'fir',
    label: 'Fairways In Regulation',
    description: 'Show directional FIR tracking on live-round holes.',
    profileKey: 'live_round_track_fir',
  },
  {
    key: 'gir',
    label: 'Greens In Regulation',
    description: 'Show directional GIR tracking on live-round holes.',
    profileKey: 'live_round_track_gir',
  },
  {
    key: 'chips',
    label: 'Chips',
    description: 'Show the short-game chips counter during live rounds.',
    profileKey: 'live_round_track_chips',
  },
  {
    key: 'greensideBunkerShots',
    label: 'Greenside Bunker Shots',
    description: 'Show the greenside bunker counter during live rounds.',
    profileKey: 'live_round_track_greenside_bunker_shots',
  },
  {
    key: 'putts',
    label: 'Putts',
    description: 'Show the putts counter during live rounds.',
    profileKey: 'live_round_track_putts',
  },
  {
    key: 'penalties',
    label: 'Penalties',
    description: 'Show the penalties counter during live rounds.',
    profileKey: 'live_round_track_penalties',
  },
] as const satisfies ReadonlyArray<{
  key: keyof LiveRoundTrackingPrefs;
  label: string;
  description: string;
  profileKey: keyof LiveRoundTrackingProfileFields;
}>;

export const LIVE_ROUND_AGGREGATE_FIELDS: readonly LiveRoundAggregateField[] = [
  'fir_hit',
  'gir_hit',
  'chips',
  'greenside_bunker_shots',
  'putts',
  'penalties',
];

export function normalizeLiveRoundTrackingPrefs(
  value?: Partial<LiveRoundTrackingPrefs> | null,
): LiveRoundTrackingPrefs {
  return {
    fir: value?.fir ?? DEFAULT_LIVE_ROUND_TRACKING_PREFS.fir,
    gir: value?.gir ?? DEFAULT_LIVE_ROUND_TRACKING_PREFS.gir,
    chips: value?.chips ?? DEFAULT_LIVE_ROUND_TRACKING_PREFS.chips,
    greensideBunkerShots:
      value?.greensideBunkerShots ?? DEFAULT_LIVE_ROUND_TRACKING_PREFS.greensideBunkerShots,
    putts: value?.putts ?? DEFAULT_LIVE_ROUND_TRACKING_PREFS.putts,
    penalties: value?.penalties ?? DEFAULT_LIVE_ROUND_TRACKING_PREFS.penalties,
  };
}

export function profileFieldsToLiveRoundTrackingPrefs(
  value?: LiveRoundTrackingProfileFields | null,
): LiveRoundTrackingPrefs {
  return normalizeLiveRoundTrackingPrefs({
    fir: value?.live_round_track_fir ?? undefined,
    gir: value?.live_round_track_gir ?? undefined,
    chips: value?.live_round_track_chips ?? undefined,
    greensideBunkerShots: value?.live_round_track_greenside_bunker_shots ?? undefined,
    putts: value?.live_round_track_putts ?? undefined,
    penalties: value?.live_round_track_penalties ?? undefined,
  });
}

export function liveRoundTrackingPrefsToProfileFields(
  value?: Partial<LiveRoundTrackingPrefs> | null,
): Required<LiveRoundTrackingProfileFields> {
  const normalized = normalizeLiveRoundTrackingPrefs(value);

  return {
    live_round_track_fir: normalized.fir,
    live_round_track_gir: normalized.gir,
    live_round_track_chips: normalized.chips,
    live_round_track_greenside_bunker_shots: normalized.greensideBunkerShots,
    live_round_track_putts: normalized.putts,
    live_round_track_penalties: normalized.penalties,
  };
}

export function sumTrackedLiveRoundField(
  holes: LiveRoundAggregateHole[],
  field: LiveRoundAggregateField,
): number | null {
  const tracked = holes.some((hole) => hole[field] != null);
  if (!tracked) {
    return null;
  }

  return holes.reduce((sum, hole) => sum + (hole[field] ?? 0), 0);
}
