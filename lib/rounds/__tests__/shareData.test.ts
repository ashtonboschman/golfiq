import { buildRoundShareData, canShareRound, roundShareAnalytics, roundShareText, type ShareRoundStats } from '../shareData';

export const shareStats: ShareRoundStats = {
  course_name: 'Southport Golf Club', number_of_holes: 18, total_score: 77,
  tee_name: 'White', course_rating: 67.3, slope_rating: 112, date: '2026-05-24T00:00:00.000Z',
  score_to_par_formatted: '+7', round_context: 'real', fir_percentage: '57', gir_percentage: '44',
  total_putts: 29, total_penalties: 0, total_chips: 3, total_greenside_bunker_shots: 1,
  hole_by_hole: false, hole_details: [],
};

describe('round share data', () => {
  test.each(['E', '+7', '-3', null])('preserves canonical to-par formatting: %s', relative => {
    expect(buildRoundShareData({ ...shareStats, score_to_par_formatted: relative }, false).relativeToPar).toBe(relative);
  });
  test.each(['0', 'NaN', 'undefined', ''])('omits unreliable relative-to-par: %s', relative => {
    expect(buildRoundShareData({ ...shareStats, score_to_par_formatted: relative }, false).relativeToPar).toBeNull();
  });
  test.each([9, 18])('labels %i holes', holes => {
    expect(buildRoundShareData({ ...shareStats, number_of_holes: holes }, false).context).toBe(`${holes} Holes`);
  });
  test('uses existing round metadata and formats the date without a timezone shift', () => {
    const data = buildRoundShareData(shareStats, false);
    expect(data.metadata).toEqual({ holes: '18 HOLES', tee: 'WHITE', ratingSlope: '67.3 / 112', roundContext: null });
    expect(data.date).toBe('Sunday, May 24, 2026');
    expect(buildRoundShareData({ ...shareStats, date: 'invalid', tee_name: null, course_rating: null, slope_rating: null }, false)).toMatchObject({
      metadata: { holes: '18 HOLES', tee: null, ratingSlope: null, roundContext: null }, date: null,
    });
  });
  test('includes a bounded signed-in display name in the card and share text', () => {
    const data = buildRoundShareData(shareStats, false, {
      firstName: '  Ashton  ',
      lastName: ` Golfer ${'Long'.repeat(20)} `,
    });
    expect(data.golferName).toBeTruthy();
    expect(data.golferName?.length).toBeLessThanOrEqual(50);
    expect(data.golferName).not.toMatch(/\s{2,}/);
    expect(roundShareText(data).startsWith(`${data.golferName}: 77 (+7)`)).toBe(true);
    expect(buildRoundShareData(shareStats, false, { firstName: '   ', lastName: null }).golferName).toBeNull();
  });
  test.each(['simulator', 'practice', 'scramble'] as const)('preserves %s context in image and text', round_context => {
    const data = buildRoundShareData({ ...shareStats, round_context }, false);
    expect(data.context.toLowerCase()).toContain(round_context);
    expect(roundShareText(data).toLowerCase()).toContain(round_context);
  });
  test('selects up to six stats in the share-card order and retains tracked zero penalties', () => {
    expect(buildRoundShareData(shareStats, false).stats.map(stat => [stat.label, stat.value])).toEqual([
      ['FIR', '57%'], ['GIR', '44%'], ['CHIPS', '3'], ['BUNKER', '1'],
      ['PUTTS', '29'], ['PENALTIES', '0'],
    ]);
  });
  test('does not invent absent stats and keeps the requested share-card order', () => {
    const data = buildRoundShareData({ ...shareStats, fir_percentage: null, gir_percentage: null, total_putts: null, total_penalties: null }, false);
    expect(data.stats.map(stat => stat.label)).toEqual(['CHIPS', 'BUNKER']);
    expect(buildRoundShareData({ ...shareStats, fir_percentage: null, gir_percentage: null, total_putts: null, total_penalties: null, total_chips: null, total_greenside_bunker_shots: null }, false).stats).toEqual([]);
  });
  test('does not substitute a derived short-game total for the six requested stats', () => {
    const data = buildRoundShareData({
      ...shareStats,
      fir_percentage: null,
      total_short_game_shots: 8,
    }, false);
    expect(data.stats.map(stat => stat.label)).toEqual(['GIR', 'CHIPS', 'BUNKER', 'PUTTS', 'PENALTIES']);
  });
  test('uses non-null summary values without inspecting hole-level tracking coverage', () => {
    const holes = Array.from({ length: 9 }, (_, i) => ({ hole_number: (i + 5) % 9 + 1, par: 4, score: 5, score_to_par: 1, fir_hit: i === 0 ? 1 : null, gir_hit: null, putts: i === 0 ? 2 : null, penalties: null, chips: null, greenside_bunker_shots: null }));
    const stats = {
      ...shareStats,
      number_of_holes: 9,
      hole_by_hole: true,
      hole_details: holes,
      fir_percentage: null,
      gir_percentage: null,
      total_chips: null,
      total_greenside_bunker_shots: null,
      total_putts: 2,
      total_penalties: null,
    };
    expect(canShareRound(stats)).toBe(true);
    expect(buildRoundShareData(stats, false).stats).toEqual([{ label: 'PUTTS', value: '2' }]);
    const fullyTrackedPutts = holes.map(hole => ({ ...hole, putts: 2 }));
    expect(buildRoundShareData({ ...stats, hole_details: fullyTrackedPutts, total_putts: 18 }, false).stats)
      .toEqual([{ label: 'PUTTS', value: '18' }]);
    expect(canShareRound({ ...stats, hole_details: holes.slice(1) })).toBe(true);
    expect(canShareRound({ ...stats, total_score: 0 })).toBe(false);
  });
  test('builds one nine-hole scorecard band in the supplied display order', () => {
    const holes = Array.from({ length: 9 }, (_, index) => ({
      hole_number: ((index + 9) % 18) + 1,
      par: index % 3 === 0 ? 3 : 4,
      yardage: 140 + index * 25,
      score: index % 3 === 0 ? 2 : 5,
      score_to_par: index % 3 === 0 ? -1 : 1,
      fir_hit: null, gir_hit: null, putts: null, penalties: null, chips: null, greenside_bunker_shots: null,
    }));
    const data = buildRoundShareData({
      ...shareStats,
      number_of_holes: 9,
      hole_by_hole: true,
      hole_details: holes,
      fir_percentage: null,
      gir_percentage: null,
      total_chips: null,
      total_greenside_bunker_shots: null,
      total_putts: null,
      total_penalties: null,
    }, false);
    const expectedHoles = holes.map(hole => ({
      holeNumber: hole.hole_number, par: hole.par, yardage: hole.yardage, score: hole.score, scoreToPar: hole.score_to_par,
    }));
    expect(data.scorecard).toEqual([{
      label: 'SCORECARD',
      totalLabel: 'IN',
      holes: expectedHoles,
      yardageTotal: expectedHoles.reduce((total, hole) => total + hole.yardage, 0),
      parTotal: expectedHoles.reduce((total, hole) => total + hole.par, 0),
      scoreTotal: expectedHoles.reduce((total, hole) => total + hole.score, 0),
    }]);
    expect(data.scorecard?.[0].holes.map(hole => hole.holeNumber)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(data.stats).toEqual([]);
  });
  test('splits 18-hole scorecards into front and back bands and omits incomplete detail', () => {
    const holes = Array.from({ length: 18 }, (_, index) => ({
      hole_number: ((index + 4) % 18) + 1, par: 4, yardage: 350 + index, score: index < 9 ? 4 : 5, score_to_par: index < 9 ? 0 : 1,
      fir_hit: null, gir_hit: null, putts: null, penalties: null, chips: null, greenside_bunker_shots: null,
    }));
    const data = buildRoundShareData({ ...shareStats, hole_by_hole: true, hole_details: holes }, false);
    expect(data.scorecard).toHaveLength(2);
    expect(data.scorecard?.[0]).toMatchObject({ label: 'FRONT NINE', totalLabel: 'OUT', parTotal: 36 });
    expect(data.scorecard?.[1]).toMatchObject({ label: 'BACK NINE', totalLabel: 'IN', parTotal: 36 });
    expect(data.scorecard?.[0].holes.map(hole => hole.holeNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(data.scorecard?.[1].holes.map(hole => hole.holeNumber)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(data.scorecard?.flatMap(band => band.holes).every(hole => hole.yardage != null)).toBe(true);
    expect((data.scorecard?.[0].scoreTotal ?? 0) + (data.scorecard?.[1].scoreTotal ?? 0)).toBe(81);
    expect(buildRoundShareData({ ...shareStats, hole_by_hole: true, hole_details: holes.slice(0, 17) }, false).scorecard).toBeNull();
  });
  test('bounds long course names', () => {
    const data = buildRoundShareData({ ...shareStats, course_name: 'Very Long Golf Club '.repeat(30) }, false);
    expect(data.course.length).toBeLessThanOrEqual(120);
  });
  test('formats canonical strokes-gained components for Premium without untracked placeholders', () => {
    const stats = {
      ...shareStats,
      sg_off_tee: 0,
      sg_approach: 1.56,
      sg_short_game: 0.54,
      sg_putting: -0.04,
      sg_penalties: -2,
      handicap_at_round: 12.4,
    };
    expect(buildRoundShareData(stats, true).strokesGained).toEqual([
      { label: 'OFF THE TEE', value: '0.0', numericValue: 0 },
      { label: 'APPROACH', value: '+1.6', numericValue: 1.6 },
      { label: 'SHORT GAME', value: '+0.5', numericValue: 0.5 },
      { label: 'PUTTING', value: '0.0', numericValue: 0 },
      { label: 'PENALTIES', value: '-2.0', numericValue: -2 },
    ]);
    expect(buildRoundShareData({ ...stats, sg_approach: null }, true).strokesGained.map(item => item.label))
      .toEqual(['OFF THE TEE', 'SHORT GAME', 'PUTTING', 'PENALTIES']);
    expect(buildRoundShareData(stats, true).strokesGainedComparison).toBe('VS. 12.4 HANDICAP');
    expect(buildRoundShareData(stats, false).strokesGained).toEqual([]);
    expect(buildRoundShareData(stats, false).strokesGainedComparison).toBeNull();
  });
  test('whitelists image and analytics data, excluding IDs, notes and GPS', () => {
    const stats = { ...shareStats, round_id: 'secret', email: 'secret@example.com', notes: 'private', latitude: 40, sg_putting: 9, user_id: 'private' };
    const data = buildRoundShareData(stats, false);
    expect(Object.keys(data).sort()).toEqual(['context', 'course', 'date', 'golferName', 'metadata', 'publicUrl', 'relativeToPar', 'score', 'scorecard', 'stats', 'strokesGained', 'strokesGainedComparison']);
    expect(JSON.stringify(data)).not.toMatch(/secret|private|latitude|sg_putting|user_id/);
    expect(roundShareAnalytics(stats, data)).toEqual({ round_type: 'real', hole_count: 18, has_strokes_gained: false, has_secondary_stats: true });
  });
});
