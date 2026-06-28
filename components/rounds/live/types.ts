export type RoundContext = 'real' | 'simulator' | 'practice';
export type TeeSegment = 'full' | 'front9' | 'back9' | 'double9';
export type LiveRoundActiveStep = 'GPS' | 'SCORE';
export type LiveRoundSessionStatus = 'ACTIVE' | 'COMPLETED' | 'DISCARDED';
export type MissDirection = 'miss_left' | 'miss_right' | 'miss_short' | 'miss_long';
export type DirectionalResult = 'untracked' | 'hit' | MissDirection;

export type LiveRoundTrackingPrefs = {
  fir: boolean;
  gir: boolean;
  chips: boolean;
  greensideBunkerShots: boolean;
  putts: boolean;
  penalties: boolean;
};

export type LiveRoundHoleDraft = {
  id: string;
  session_id: string;
  hole_id: string;
  hole_number: number;
  display_hole_number: number;
  pass: number;
  score: number | null;
  fir_hit: number | null;
  fir_direction: MissDirection | null;
  gir_hit: number | null;
  gir_direction: MissDirection | null;
  putts: number | null;
  penalties: number | null;
  chips: number | null;
  greenside_bunker_shots: number | null;
  created_at: string | null;
  updated_at: string | null;
  hole: {
    id: string;
    hole_number: number;
    par: number;
    yardage: number | null;
    handicap: number | null;
  } | null;
};

export type LiveRoundSession = {
  id: string;
  user_id: string;
  course_id: string;
  tee_id: string;
  final_round_id: string | null;
  status: LiveRoundSessionStatus;
  date: string;
  tee_segment: TeeSegment;
  round_context: RoundContext;
  notes: string | null;
  start_hole_number: number;
  active_hole_number: number;
  active_hole_pass: number;
  active_step: LiveRoundActiveStep;
  tracking_prefs: {
    fir: boolean;
    gir: boolean;
    chips: boolean;
    greenside_bunker_shots: boolean;
    putts: boolean;
    penalties: boolean;
  };
  started_at: string | null;
  last_saved_at: string | null;
  completed_at: string | null;
  discarded_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  course: {
    id: string;
    club_name: string;
    course_name: string;
  } | null;
  tee: {
    id: string;
    tee_name: string | null;
    gender: string | null;
    number_of_holes: number | null;
    par_total: number | null;
    course_rating: number | null;
    slope_rating: number | null;
  } | null;
  final_round: {
    id: string;
    score: number;
    date: string;
  } | null;
  hole_drafts: LiveRoundHoleDraft[];
};

export function sessionTrackingPrefs(session: LiveRoundSession): LiveRoundTrackingPrefs {
  return {
    fir: session.tracking_prefs.fir,
    gir: session.tracking_prefs.gir,
    chips: session.tracking_prefs.chips,
    greensideBunkerShots: session.tracking_prefs.greenside_bunker_shots,
    putts: session.tracking_prefs.putts,
    penalties: session.tracking_prefs.penalties,
  };
}

export function sortHoleDrafts(drafts: LiveRoundHoleDraft[]) {
  return [...drafts].sort((a, b) => {
    if (a.display_hole_number !== b.display_hole_number) {
      return a.display_hole_number - b.display_hole_number;
    }
    return a.pass - b.pass;
  });
}

export function teeSegmentLabel(segment: TeeSegment, teeHoles?: number | null) {
  switch (segment) {
    case 'front9':
      return 'Front 9';
    case 'back9':
      return 'Back 9';
    case 'double9':
      return '18 Holes';
    case 'full':
    default:
      return teeHoles === 9 ? '9 Holes' : '18 Holes';
  }
}
