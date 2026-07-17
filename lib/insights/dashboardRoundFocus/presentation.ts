import {
  parseDashboardRoundFocusDto,
  type DashboardRoundFocusCategory,
  type DashboardRoundFocusDto,
} from './types';

export type DashboardRoundFocusPresentation = {
  state: 'ready' | 'building' | 'unavailable';
  headline: string;
  supportingText?: string;
  nextRoundAction?: string;
  confidenceLabel: 'Strong' | 'Moderate' | 'Building';
  category?: DashboardRoundFocusCategory;
  tone: 'warning' | 'info' | 'success';
};

const CATEGORY_LABELS: Record<DashboardRoundFocusCategory, string> = {
  off_the_tee: 'Off the Tee',
  approach: 'Approach',
  short_game: 'Short Game',
  putting: 'Putting',
  penalties: 'Penalties',
  big_numbers: 'Big Numbers',
  volatility: 'Scoring Consistency',
  scoring_control: 'Scoring Control',
  all_around: 'Overall Game',
};

const CATEGORY_REFERENCES: Record<DashboardRoundFocusCategory, string> = {
  off_the_tee: 'off-the-tee play',
  approach: 'approach play',
  short_game: 'short-game play',
  putting: 'putting',
  penalties: 'penalties',
  big_numbers: 'big numbers',
  volatility: 'scoring consistency',
  scoring_control: 'scoring control',
  all_around: 'all-around play',
};

const NEXT_ROUND_ACTIONS: Partial<Record<DashboardRoundFocusCategory, string>> = {
  off_the_tee: 'Prioritize keeping the ball in play off the tee.',
  approach: 'Choose targets that leave the largest margin for error.',
  short_game: 'Choose the simplest shot that gets the ball safely onto the green.',
  putting: 'Prioritize pace control and leave manageable second putts.',
  penalties: 'Prioritize keeping penalty trouble out of play.',
  big_numbers: 'After a mistake, choose the shot that gets the hole back under control.',
  volatility: 'Keep the plan simple and avoid compounding mistakes.',
  scoring_control: 'Keep the plan simple and avoid compounding mistakes.',
};

function latestRoundAction(
  category: DashboardRoundFocusCategory,
  polarity: DashboardRoundFocusDto['latestRoundPolarity'],
): string | undefined {
  if (polarity === 'neutral') return undefined;
  if (polarity === 'strength') {
    if (category === 'scoring_control') {
      return 'Carry the same controlled scoring pattern into the next one.';
    }
    if (category === 'all_around') return undefined;
  }
  return NEXT_ROUND_ACTIONS[category];
}

function unavailablePresentation(): DashboardRoundFocusPresentation {
  return {
    state: 'unavailable',
    headline: 'There is not enough consistent evidence to name one focus yet.',
    confidenceLabel: 'Building',
    tone: 'info',
  };
}

function confidenceLabel(
  confidence: DashboardRoundFocusDto['confidence'],
): DashboardRoundFocusPresentation['confidenceLabel'] {
  if (confidence === 'strong') return 'Strong';
  if (confidence === 'moderate') return 'Moderate';
  return 'Building';
}

function neutralPresentation(dto: DashboardRoundFocusDto): DashboardRoundFocusPresentation {
  const shared = {
    confidenceLabel: 'Building' as const,
    tone: 'info' as const,
  };
  if (dto.trendState === 'all_positive') {
    return {
      ...shared,
      state: 'ready',
      headline: 'No single area stands out as a weakness across your recent rounds.',
      supportingText: 'Your recent play has been balanced, so there is no need to force a single focus yet.',
      tone: 'success',
    };
  }
  if (dto.trendState === 'no_clear_separator') {
    return {
      ...shared,
      state: 'building',
      headline: 'Your recent rounds are balanced enough that no single focus stands out yet.',
      supportingText: 'Keep tracking complete rounds and GolfIQ will surface a focus when one separates clearly.',
    };
  }
  if (dto.trendReason === 'fewer_than_five_recent') {
    return {
      ...shared,
      state: 'building',
      headline: 'Keep logging rounds to build a reliable recent focus.',
    };
  }
  if (
    dto.trendReason === 'insufficient_component_coverage' ||
    dto.trendReason === 'no_eligible_components'
  ) {
    return {
      ...shared,
      state: 'building',
      headline: 'Track a few more complete rounds to identify a reliable focus.',
      supportingText: 'More complete stat tracking will help GolfIQ separate the areas of your game.',
    };
  }
  return {
    ...shared,
    state: 'building',
    headline: 'There is not enough consistent evidence to name one focus yet.',
  };
}

function latestRoundPresentation(
  dto: DashboardRoundFocusDto,
  category: DashboardRoundFocusCategory,
): DashboardRoundFocusPresentation {
  const reference = CATEGORY_REFERENCES[category];
  const shared = {
    state: 'ready' as const,
    confidenceLabel: confidenceLabel(dto.confidence),
    category,
    nextRoundAction: latestRoundAction(category, dto.latestRoundPolarity),
  };

  if (dto.latestRoundPolarity === 'strength') {
    if (category === 'all_around') {
      return {
        ...shared,
        headline: 'Your latest round showed strong all-around play.',
        supportingText: 'Carry that same balanced pattern into the next one.',
        tone: 'success',
      };
    }
    return {
      ...shared,
      headline: `Your latest round showed strong ${reference}. Carry that same pattern into the next one.`,
      tone: 'success',
    };
  }
  if (dto.latestRoundPolarity === 'neutral') {
    if (category === 'scoring_control') {
      return {
        ...shared,
        headline: 'Scoring control is the clearest takeaway from your latest round.',
        supportingText: 'No single tracked area stood out enough to support a more specific recommendation.',
        tone: 'info',
      };
    }
    return {
      ...shared,
      headline: `Your latest round offers a useful ${reference} focus for the next one.`,
      tone: 'info',
    };
  }
  if (category === 'penalties') {
    return {
      ...shared,
      headline: 'Keeping penalties off the card is the clearest focus from your latest round.',
      tone: 'warning',
    };
  }
  if (category === 'big_numbers') {
    return {
      ...shared,
      headline: 'Avoiding big numbers is the clearest focus from your latest round.',
      tone: 'warning',
    };
  }
  if (category === 'volatility') {
    return {
      ...shared,
      headline: 'Improving scoring consistency is the clearest focus from your latest round.',
      tone: 'warning',
    };
  }
  if (category === 'all_around') {
    return {
      ...shared,
      headline: 'Your latest round points to all-around play as the clearest area to address next.',
      supportingText: 'Several areas contributed, rather than one clear weakness defining the round.',
      tone: 'warning',
    };
  }
  return {
    ...shared,
    headline: `Your latest round points to ${reference} as the clearest area to address next.`,
    tone: 'warning',
  };
}

export function composeDashboardRoundFocus(
  value: unknown,
): DashboardRoundFocusPresentation {
  const dto = parseDashboardRoundFocusDto(value);
  if (!dto) return unavailablePresentation();

  const category = dto.selectedCategory ?? undefined;
  if (dto.source === 'latest_round' && category) {
    return latestRoundPresentation(dto, category);
  }
  if (dto.source !== 'trend' || !category) return neutralPresentation(dto);

  const label = CATEGORY_LABELS[category];
  const latestCategory = dto.latestRoundCategory ?? undefined;
  const selectedName = label.toLowerCase();
  const latestReference = latestCategory ? CATEGORY_REFERENCES[latestCategory] : undefined;
  const shared = {
    state: 'ready' as const,
    headline: `${label} is the clearest scoring focus right now.`,
    confidenceLabel: confidenceLabel(dto.confidence),
    category,
    nextRoundAction: NEXT_ROUND_ACTIONS[category],
  };

  if (dto.relationship === 'reinforced_by_latest_round') {
    return {
      ...shared,
      supportingText: 'Your latest round showed the same pattern.',
      tone: dto.baselineDirection === 'improving' ? 'info' : 'warning',
    };
  }
  if (dto.relationship === 'latest_round_improved_against_trend') {
    return {
      ...shared,
      supportingText: 'It was stronger in your latest round, but the broader pattern still deserves attention.',
      tone: 'info',
    };
  }
  if (dto.relationship === 'latest_round_inconclusive_same_category') {
    return {
      ...shared,
      supportingText: 'Your latest round did not clearly confirm or reverse that pattern.',
      tone: 'info',
    };
  }
  if (dto.relationship === 'latest_round_conflicts' && latestReference) {
    const isScoringConsistency = latestCategory === 'volatility';
    const latestClause = dto.latestRoundPolarity === 'strength'
      ? isScoringConsistency
        ? 'Your latest round showed better scoring consistency'
        : `Your latest round showed stronger ${latestReference}`
      : `Your latest round pointed more toward ${latestReference}`;
    const trendClause = isScoringConsistency
      ? `${selectedName} has been the broader recurring pattern.`
      : `${selectedName} has been the more consistent pattern.`;
    return {
      ...shared,
      supportingText: `${latestClause}, but ${trendClause}`,
      tone: 'info',
    };
  }

  return {
    ...shared,
    supportingText: 'It has been the most consistent area holding back your recent scoring.',
    tone: dto.baselineDirection === 'worse' ? 'warning' : 'info',
  };
}
