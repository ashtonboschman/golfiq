export const SG_COEFFICIENTS = {
  // --- Stroke attribution ---
  STROKES_PER_FIR: 0.25,
  STROKES_PER_GIR: 0.75,
  STROKES_PER_PUTT: 1.0,
  STROKES_PER_PENALTY: 1.0,

  // --- Course difficulty adjustments ---
  COURSE_DIFF_TO_FIR_PCT: 0.10,    // % FIR per stroke harder
  COURSE_DIFF_TO_GIR_PCT: 0.22,    // % GIR per stroke harder
  COURSE_DIFF_TO_PUTTS: 0.12,      // putts per stroke harder
  COURSE_DIFF_TO_PENALTIES: 0.10,  // penalties per stroke harder

  // --- Putting caps ---
  PUTTING_CAP: 3.5,

  // --- Confidence thresholds ---
  CONFIDENCE_RESIDUAL_HIGH: 3.0,                  // sgResidual below this → high confidence
  CONFIDENCE_RESIDUAL_LOW_FACTOR: 3.0,            // fraction of holes for low confidence check
  CONFIDENCE_SHORTGAME_HIGH_PCT: 0.44,            // min short game opportunities for high confidence
  CONFIDENCE_SHORTGAME_MEDIUM_MIN_PCT: 0.28,      // min for medium confidence
  CONFIDENCE_SHORTGAME_MEDIUM_MAX_PCT: 0.39,      // max for medium confidence
  CONFIDENCE_PUTTING_HIGH_PCT: 0.71,              // fraction of puttingCap before medium confidence
};