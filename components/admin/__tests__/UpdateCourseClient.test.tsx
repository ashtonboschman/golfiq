/** @jest-environment jsdom */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import UpdateCourseClient from '@/components/admin/UpdateCourseClient';
import type { CourseComparison, NormalizedProviderTee } from '@/lib/courses/update/types';

const showMessage = jest.fn();
const showConfirm = jest.fn();

jest.mock('@/app/providers', () => ({
  useMessage: () => ({ showMessage, showConfirm }),
}));

function providerTee(key: string, name = 'Blue'): NormalizedProviderTee {
  const valid = <T,>(value: T) => ({ state: 'valid' as const, value });
  return {
    providerTeeId: null,
    providerTeeKey: key,
    descriptor: { gender: 'male', rawName: name, normalizedName: name.toLowerCase(), signature: 's'.repeat(64) },
    gender: 'male',
    teeName: valid(name),
    courseRating: valid(68),
    slopeRating: valid(108),
    totalYards: valid(5994),
    totalMeters: valid(5481),
    numberOfHoles: valid(9),
    parTotal: valid(36),
    holes: Array.from({ length: 9 }, (_, index) => ({
      holeNumber: index + 1,
      par: valid(4),
      yardage: valid(300),
      handicap: { state: 'absent', value: null },
    })),
    holeNumberSource: 'array-position',
    supported: true,
    issues: [],
    warnings: [],
  };
}

function comparisonFixture(): CourseComparison {
  const provider = providerTee('a'.repeat(64));
  return {
    schemaVersion: 1,
    courseId: '1',
    courseName: 'Course',
    clubName: 'Club',
    provider: 'golfcourseapi',
    externalCourseId: '00hgpgma',
    comparedAt: '2026-09-18T12:00:00.000Z',
    localSnapshotHash: 'b'.repeat(64),
    providerSnapshotHash: 'c'.repeat(64),
    summary: {
      changedFields: 4, missingLocalFields: 0, matchedTeesWithDifferences: 3,
      newProviderTees: 1, localOnlyTees: 1, activeSessionBlockedTees: 1, invalidProviderItems: 0,
    },
    matchedTees: [
      {
        localTeeId: '10', localTeeName: 'Blue', localGender: 'male', provider,
        matchMethod: 'exact-name', historicalUse: {
          completedRoundCount: 0, activeLiveSessionCount: 0, blockedByActiveSession: false,
        },
        malformedLocalData: false, hasDifferences: true,
        fields: [
          { field: 'courseRating', label: 'Course Rating', localValue: 68.2, providerValue: 68, status: 'changed', selectable: true },
          { field: 'slopeRating', label: 'Slope Rating', localValue: 114, providerValue: 108, status: 'changed', selectable: true },
        ],
        holes: [{ holeId: '100', holeNumber: 1, fields: [
          { field: 'yardage', label: 'Yardage', localValue: 299, providerValue: 300, status: 'changed', selectable: true },
        ] }],
      },
      {
        localTeeId: '11', localTeeName: 'White', localGender: 'male', provider: providerTee('d'.repeat(64), 'White'),
        matchMethod: 'exact-name', historicalUse: {
          completedRoundCount: 1, activeLiveSessionCount: 0, blockedByActiveSession: false,
        },
        malformedLocalData: false, hasDifferences: true,
        fields: [{
          field: 'courseRating', label: 'Course Rating', localValue: 67, providerValue: 66.8,
          status: 'changed', selectable: true,
        }],
        holes: [],
      },
      {
        localTeeId: '13', localTeeName: 'Red', localGender: 'male', provider: providerTee('f'.repeat(64), 'Red'),
        matchMethod: 'exact-name', historicalUse: {
          completedRoundCount: 2, activeLiveSessionCount: 1, blockedByActiveSession: true,
        },
        malformedLocalData: false, hasDifferences: true,
        fields: [{
          field: 'courseRating', label: 'Course Rating', localValue: 65, providerValue: 64.8,
          status: 'changed', selectable: false,
          disabledReason: 'This tee cannot be updated while an active live round is using it.',
        }],
        holes: [],
      },
    ],
    unmatchedProviderTees: [{
      provider: providerTee('e'.repeat(64), 'Green'),
      suggestedLocalTeeIds: [],
      compatibleLocalTees: [],
    }],
    localOnlyTees: [{
      id: '12', teeName: 'Gold', gender: 'male', numberOfHoles: 9, totalYards: 2500,
      historicalUse: {
        completedRoundCount: 0, activeLiveSessionCount: 0, blockedByActiveSession: false,
      },
    }],
    warnings: [],
  };
}

async function loadComparison() {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ comparison: comparisonFixture() }),
  });
  render(<UpdateCourseClient courseId="1" hasSingleMapping />);
  fireEvent.click(screen.getByRole('button', { name: 'Check for Updates' }));
  await screen.findByText('Blue');
}

describe('UpdateCourseClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('starts unchecked and supports rating/slope and clear bulk actions', async () => {
    await loadComparison();
    const blueCard = screen.getByRole('heading', { name: 'Blue' }).closest('article');
    expect(blueCard).not.toBeNull();
    const blue = within(blueCard!);
    const rating = blue.getByRole('checkbox', { name: 'Apply Course Rating for Blue' });
    const slope = blue.getByRole('checkbox', { name: 'Apply Slope Rating for Blue' });
    expect(rating).not.toBeChecked();
    expect(slope).not.toBeChecked();

    fireEvent.click(blue.getByRole('button', { name: 'Select Rating & Slope' }));
    expect(rating).toBeChecked();
    expect(slope).toBeChecked();
    fireEvent.click(blue.getByRole('button', { name: 'Clear Selection' }));
    expect(rating).not.toBeChecked();
    expect(slope).not.toBeChecked();
  });

  it('shows completed-round usage as a warning while keeping controls enabled', async () => {
    await loadComparison();
    expect(screen.getByText('Used by 1 Completed Round')).toBeInTheDocument();
    expect(screen.getByText('Updating this tee may change course information shown for historical rounds.')).toBeInTheDocument();
    const historicalUpdate = screen.getByRole('checkbox', { name: 'Apply Course Rating for White' });
    expect(historicalUpdate).toBeEnabled();
    fireEvent.click(historicalUpdate);
    fireEvent.click(screen.getByRole('button', { name: 'Review & Apply Selected Updates' }));
    expect(showConfirm).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('White is referenced by 1 completed round.'),
    }));
  });

  it('shows an active-round lock and disables its reconciliation controls', async () => {
    await loadComparison();
    expect(screen.getByText('Active Round in Progress')).toBeInTheDocument();
    expect(screen.getByText('This tee cannot be updated while an active round is using it.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Apply Course Rating for Red' })).toBeDisabled();
  });

  it('stages new tees without immediately applying', async () => {
    await loadComparison();
    fireEvent.click(screen.getByLabelText('Add male Green tee'));
    fireEvent.click(screen.getByRole('button', { name: 'Review & Apply Selected Updates' }));
    expect(showConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Apply Selected Course Updates?',
      confirmText: 'Apply Updates',
    }));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not add a historical warning when only an unused tee is selected', async () => {
    await loadComparison();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Apply Course Rating for Blue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review & Apply Selected Updates' }));

    expect(showConfirm).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.not.stringContaining('completed round'),
    }));
  });

  it('shows provider errors without creating selections', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'Provider unavailable' }) });
    render(<UpdateCourseClient courseId="1" hasSingleMapping />);
    fireEvent.click(screen.getByRole('button', { name: 'Check for Updates' }));
    await waitFor(() => expect(showMessage).toHaveBeenCalledWith('Provider unavailable', 'error'));
    expect(screen.queryByText(/Selected$/)).not.toBeInTheDocument();
  });
});
