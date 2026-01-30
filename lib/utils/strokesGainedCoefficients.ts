export const SG_COEFFICIENTS = {
  // --- Stroke attribution ---
  STROKES_PER_FIR: 0.25,
  STROKES_PER_GIR: 0.62,
  STROKES_PER_PUTT: 1.0,
  STROKES_PER_PENALTY: 1.0,

  // --- Course difficulty adjustments ---
  RATING_TO_FIR_PCT: 0.8,           // % FIR per rating stroke harder (affects everyone)
  SLOPE_TO_FIR_PCT: 1.0,            // % FIR per slope-adjusted stroke (handicap-weighted)
  RATING_TO_GIR_PCT: 1.5,           // % GIR per rating stroke harder (affects everyone)
  SLOPE_TO_GIR_PCT: 1.5,            // % GIR per slope-adjusted stroke (handicap-weighted)
  COURSE_DIFF_TO_PUTTS: 0.12,      // putts per stroke harder
  COURSE_DIFF_TO_PENALTIES: 0.60,  // penalties per stroke harder

  // --- Putting caps ---
  PUTTING_CAP: 3.5,

  // --- Confidence thresholds ---
  CONFIDENCE_RESIDUAL_HIGH: 3.0,                  // sgResidual below this → high confidence
  CONFIDENCE_SHORTGAME_HIGH_PCT: 0.44,            // min short game opportunities for high confidence
  CONFIDENCE_SHORTGAME_MEDIUM_MIN_PCT: 0.28,      // min for medium confidence
  CONFIDENCE_SHORTGAME_MEDIUM_MAX_PCT: 0.39,      // max for medium confidence
  CONFIDENCE_PUTTING_HIGH_PCT: 0.71,              // fraction of puttingCap before medium confidence
};