import {
  liveRoundTrackingPrefsToProfileFields,
  profileFieldsToLiveRoundTrackingPrefs,
  sumTrackedLiveRoundField,
} from '@/lib/rounds/liveRoundTracking';

describe('liveRoundTracking helpers', () => {
  it('maps profile fields into live round tracking prefs', () => {
    expect(
      profileFieldsToLiveRoundTrackingPrefs({
        live_round_track_fir: true,
        live_round_track_gir: false,
        live_round_track_chips: false,
        live_round_track_greenside_bunker_shots: true,
        live_round_track_putts: true,
        live_round_track_penalties: false,
      }),
    ).toEqual({
      fir: true,
      gir: false,
      chips: false,
      greensideBunkerShots: true,
      putts: true,
      penalties: false,
    });
  });

  it('maps live round tracking prefs into profile payload fields', () => {
    expect(
      liveRoundTrackingPrefsToProfileFields({
        fir: false,
        gir: true,
        chips: true,
        greensideBunkerShots: false,
        putts: false,
        penalties: true,
      }),
    ).toEqual({
      live_round_track_fir: false,
      live_round_track_gir: true,
      live_round_track_chips: true,
      live_round_track_greenside_bunker_shots: false,
      live_round_track_putts: false,
      live_round_track_penalties: true,
    });
  });

  it('keeps untracked live-round aggregate fields null instead of forcing zero', () => {
    expect(
      sumTrackedLiveRoundField(
        [
          { putts: null, penalties: null },
          { putts: null, penalties: null },
        ],
        'putts',
      ),
    ).toBeNull();

    expect(
      sumTrackedLiveRoundField(
        [
          { penalties: 0 },
          { penalties: 1 },
        ],
        'penalties',
      ),
    ).toBe(1);
  });
});
