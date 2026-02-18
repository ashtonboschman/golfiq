import { getMissingCount, getMissingStats, getMissingStatKeys } from '@/lib/insights/postRound/missingStats';
import { buildNextRoundFocusText } from '@/lib/insights/postRound/nextRoundFocus';
import { buildMeasuredComponents, runMeasuredSgSelection } from '@/lib/insights/postRound/sgSelection';

type Combo = {
  fir: boolean;
  gir: boolean;
  putts: boolean;
  penalties: boolean;
};

function buildCombo(index: number): Combo {
  return {
    fir: Boolean(index & 0b1000),
    gir: Boolean(index & 0b0100),
    putts: Boolean(index & 0b0010),
    penalties: Boolean(index & 0b0001),
  };
}

describe('SG observability state space (16 combinations)', () => {
  for (let i = 0; i < 16; i += 1) {
    const combo = buildCombo(i);
    const presentCount = Number(combo.fir) + Number(combo.gir) + Number(combo.putts) + Number(combo.penalties);
    const label = `combo=${i.toString(2).padStart(4, '0')} present=${presentCount}`;

    it(label, () => {
      const round = {
        firHit: combo.fir ? 8 : null,
        girHit: combo.gir ? 9 : null,
        putts: combo.putts ? 32 : null,
        penalties: combo.penalties ? 1 : null,
      };
      const missing = getMissingStats(round);
      const missingCount = getMissingCount(missing);
      const missingKeys = getMissingStatKeys(missing);

      expect(missingCount).toBe(4 - presentCount);
      expect(missingKeys.length).toBe(4 - presentCount);

      const measured = buildMeasuredComponents({
        offTee: combo.fir ? -0.2 : null,
        approach: combo.gir ? -0.6 : null,
        putting: combo.putts ? -1.1 : null,
        penalties: combo.penalties ? -0.4 : null,
        residual: -2.0,
        total: -2.3,
      });
      expect(measured.length).toBe(presentCount);
      expect(measured.some((component) => (component as any).name === 'short_game')).toBe(false);

      const selection = runMeasuredSgSelection(
        {
          offTee: combo.fir ? -0.2 : null,
          approach: combo.gir ? -0.6 : null,
          putting: combo.putts ? -1.1 : null,
          penalties: combo.penalties ? -0.4 : null,
          residual: -2.0,
          total: -2.3,
        },
        -1.0,
      );
      expect(selection.componentCount).toBe(presentCount);
      expect((selection.opportunity?.name ?? '').toString()).not.toBe('short_game');

      const focus = buildNextRoundFocusText({
        missing,
        worstMeasured: selection.opportunity?.name ?? null,
        opportunityIsWeak: selection.opportunityIsWeak,
        weakSeparation: selection.weakSeparation,
      });

      if (missingCount === 0) {
        expect(focus.text.toLowerCase()).not.toContain('track ');
      } else {
        expect(focus.text.toLowerCase()).toContain('track ');
      }
    });
  }
});

describe('runMeasuredSgSelection opportunity selection', () => {
  test('single-component measured input returns null opportunity', () => {
    const selection = runMeasuredSgSelection(
      {
        offTee: -0.6,
        approach: null,
        putting: null,
        penalties: null,
        residual: -1.2,
        total: -1.8,
      },
      -1.0,
    );

    expect(selection.best?.name).toBe('off_tee');
    expect(selection.opportunity).toBeNull();
    expect(selection.opportunityIsWeak).toBe(false);
  });

  test('two-component measured input picks distinct best and opportunity', () => {
    const selection = runMeasuredSgSelection(
      {
        offTee: 0.2,
        approach: -1.1,
        putting: null,
        penalties: null,
        residual: -0.3,
        total: -1.2,
      },
      -1.0,
    );

    expect(selection.best).not.toBeNull();
    expect(selection.opportunity).not.toBeNull();
    expect(selection.best?.name).not.toBe(selection.opportunity?.name);
    expect(selection.opportunity?.name).toBe('approach');
  });

  test('9-hole normalization can tighten weak-separation threshold', () => {
    const unscaled = runMeasuredSgSelection(
      {
        offTee: 0.1,
        approach: -0.2,
        putting: -0.45,
        penalties: null,
        residual: -0.2,
        total: -0.8,
      },
      -1.0,
    );
    expect(unscaled.weakSeparation).toBe(true);

    const scaled = runMeasuredSgSelection(
      {
        offTee: 0.1,
        approach: -0.2,
        putting: -0.45,
        penalties: null,
        residual: -0.2,
        total: -0.8,
      },
      -0.5,
      { weakSeparationDelta: 0.2, dominanceAbsoluteFloor: 0.5 },
    );
    expect(scaled.weakSeparation).toBe(false);
  });

  test('9-hole normalization can lower residual dominance absolute floor', () => {
    const unscaled = runMeasuredSgSelection(
      {
        offTee: -0.2,
        approach: -0.4,
        putting: -0.3,
        penalties: null,
        residual: 0.7,
        total: -1.0,
      },
      -1.0,
    );
    expect(unscaled.residualDominant).toBe(false);

    const scaled = runMeasuredSgSelection(
      {
        offTee: -0.2,
        approach: -0.4,
        putting: -0.3,
        penalties: null,
        residual: 0.7,
        total: -1.0,
      },
      -0.5,
      { weakSeparationDelta: 0.2, dominanceAbsoluteFloor: 0.5 },
    );
    expect(scaled.residualDominant).toBe(true);
  });

  test('residual dominance avoids ratio-only trigger when total SG is near zero', () => {
    const selection = runMeasuredSgSelection(
      {
        offTee: -0.4,
        approach: 0.2,
        putting: 0.1,
        penalties: null,
        residual: 0.2,
        total: 0.2,
      },
      -1.0,
      { dominanceAbsoluteFloor: 0.1, totalFloorForRatio: 0.5 },
    );

    expect(selection.residualDominant).toBe(false);
  });
});
