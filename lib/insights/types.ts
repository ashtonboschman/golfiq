export type SgMeasuredComponentName = 'off_tee' | 'approach' | 'putting' | 'penalties';

export type AdvancedStatKey = 'fir' | 'gir' | 'putts' | 'penalties';

export type MissingStats = {
  fir: boolean;
  gir: boolean;
  putts: boolean;
  penalties: boolean;
};

export type ViewerEntitlements = {
  isPremium: boolean;
  showStrokesGained: boolean;
};
