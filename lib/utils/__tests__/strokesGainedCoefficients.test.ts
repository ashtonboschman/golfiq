import { SG_COEFFICIENTS as C } from "../strokesGainedCoefficients";

describe("strokesGainedCoefficients", () => {
  it("has expected numeric values for stroke attribution", () => {
    expect(C.STROKES_PER_FIR).toBe(0.25);
    expect(C.STROKES_PER_GIR).toBe(0.62);
    expect(C.STROKES_PER_PUTT).toBe(1.0);
    expect(C.STROKES_PER_PENALTY).toBe(1.0);
  });

  it("has expected difficulty adjustment coefficients", () => {
    expect(C.RATING_TO_FIR_PCT).toBe(0.8);
    expect(C.SLOPE_TO_FIR_PCT).toBe(1.0);
    expect(C.RATING_TO_GIR_PCT).toBe(1.5);
    expect(C.SLOPE_TO_GIR_PCT).toBe(1.5);
    expect(C.COURSE_DIFF_TO_PUTTS).toBe(0.12);
    expect(C.COURSE_DIFF_TO_PENALTIES).toBe(0.6);
  });

  it("has expected confidence thresholds", () => {
    expect(C.PUTTING_CAP).toBe(3.5);
    expect(C.CONFIDENCE_RESIDUAL_HIGH).toBe(3.0);
    expect(C.CONFIDENCE_SHORTGAME_HIGH_PCT).toBe(0.44);
    expect(C.CONFIDENCE_SHORTGAME_MEDIUM_MIN_PCT).toBe(0.28);
    expect(C.CONFIDENCE_SHORTGAME_MEDIUM_MAX_PCT).toBe(0.39);
    expect(C.CONFIDENCE_PUTTING_HIGH_PCT).toBe(0.71);
  });
});
