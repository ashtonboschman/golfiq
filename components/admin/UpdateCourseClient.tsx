'use client';

import { useMemo, useState } from 'react';
import { useMessage } from '@/app/providers';
import type {
  ApplyReconciliationRequest,
  CourseComparison,
  FieldDiff,
  ManualTeeMatch,
  MatchedTeeComparison,
  ReconciliationFieldKey,
  ReconciliationHoleFieldKey,
} from '@/lib/courses/update/types';

type Props = {
  courseId: string;
  hasSingleMapping: boolean;
};

type SelectionMap = Record<string, true>;

const teeSelectionKey = (teeId: string, field: string) => `tee:${teeId}:${field}`;
const holeSelectionKey = (teeId: string, holeNumber: number, field: string) =>
  `hole:${teeId}:${holeNumber}:${field}`;

function visibleField(field: FieldDiff, showUnchanged: boolean) {
  if (field.status === 'missingProvider') return showUnchanged;
  return showUnchanged || field.status !== 'unchanged';
}

function displayValue(value: string | number | null) {
  return value === null ? '—' : String(value);
}

function buildApplyRequest(
  comparison: CourseComparison,
  selections: SelectionMap,
  newTeeKeys: Set<string>,
): ApplyReconciliationRequest {
  const matchedTeeUpdates = comparison.matchedTees.flatMap((tee) => {
    const take: Record<string, unknown> = {};
    tee.fields.forEach((field) => {
      if (selections[teeSelectionKey(tee.localTeeId, field.field)]) take[field.field] = true;
    });
    const holes = tee.holes.flatMap((hole) => {
      const selected: Record<string, unknown> = { holeNumber: hole.holeNumber };
      hole.fields.forEach((field) => {
        if (selections[holeSelectionKey(tee.localTeeId, hole.holeNumber, field.field)]) {
          selected[field.field] = true;
        }
      });
      return Object.keys(selected).length > 1 ? [selected] : [];
    });
    if (holes.length) take.holes = holes;
    return Object.keys(take).length
      ? [{ localTeeId: tee.localTeeId, providerTeeKey: tee.provider.providerTeeKey, take }]
      : [];
  });

  return {
    schemaVersion: comparison.schemaVersion,
    courseId: comparison.courseId,
    provider: comparison.provider,
    externalCourseId: comparison.externalCourseId,
    base: {
      comparedAt: comparison.comparedAt,
      localSnapshotHash: comparison.localSnapshotHash,
      providerSnapshotHash: comparison.providerSnapshotHash,
    },
    matchedTeeUpdates: matchedTeeUpdates as ApplyReconciliationRequest['matchedTeeUpdates'],
    newTees: Array.from(newTeeKeys).map((providerTeeKey) => ({ providerTeeKey, add: true })),
  };
}

function fieldSelectionKeys(tee: MatchedTeeComparison, predicate: (field: FieldDiff) => boolean) {
  const keys: string[] = [];
  tee.fields.forEach((field) => {
    if (field.selectable && predicate(field)) keys.push(teeSelectionKey(tee.localTeeId, field.field));
  });
  tee.holes.forEach((hole) => hole.fields.forEach((field) => {
    if (field.selectable && predicate(field)) {
      keys.push(holeSelectionKey(tee.localTeeId, hole.holeNumber, field.field));
    }
  }));
  return keys;
}

function hasSelectedChanges(tee: MatchedTeeComparison, selections: SelectionMap) {
  return tee.fields.some((field) => selections[teeSelectionKey(tee.localTeeId, field.field)])
    || tee.holes.some((hole) => hole.fields.some(
      (field) => selections[holeSelectionKey(tee.localTeeId, hole.holeNumber, field.field)],
    ));
}

export default function UpdateCourseClient({ courseId, hasSingleMapping }: Props) {
  const { showMessage, showConfirm } = useMessage();
  const [comparison, setComparison] = useState<CourseComparison | null>(null);
  const [manualMatches, setManualMatches] = useState<ManualTeeMatch[]>([]);
  const [selections, setSelections] = useState<SelectionMap>({});
  const [newTeeKeys, setNewTeeKeys] = useState<Set<string>>(() => new Set());
  const [manualChoices, setManualChoices] = useState<Record<string, string>>({});
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const selectionCount = Object.keys(selections).length + newTeeKeys.size;
  const reviewLines = useMemo(() => {
    if (!comparison) return [];
    const lines: string[] = [];
    comparison.matchedTees.forEach((tee) => {
      let recalculatesYards = false;
      let recalculatesPar = false;
      tee.fields.forEach((field) => {
        if (selections[teeSelectionKey(tee.localTeeId, field.field)]) {
          lines.push(`${tee.localTeeName}: ${field.label} ${displayValue(field.localValue)} → ${displayValue(field.providerValue)}`);
        }
      });
      tee.holes.forEach((hole) => hole.fields.forEach((field) => {
        if (selections[holeSelectionKey(tee.localTeeId, hole.holeNumber, field.field)]) {
          lines.push(`${tee.localTeeName} Hole ${hole.holeNumber}: ${field.label} ${displayValue(field.localValue)} → ${displayValue(field.providerValue)}`);
          if (field.field === 'yardage') recalculatesYards = true;
          if (field.field === 'par') recalculatesPar = true;
        }
      }));
      if (recalculatesYards) lines.push(`${tee.localTeeName}: Total yards will be recalculated from the selected hole changes.`);
      if (recalculatesPar) lines.push(`${tee.localTeeName}: Par total and non-par-3 count will be recalculated.`);
    });
    comparison.unmatchedProviderTees.forEach(({ provider }) => {
      if (newTeeKeys.has(provider.providerTeeKey)) lines.push(`Add ${provider.gender} ${provider.descriptor.rawName} (${provider.holes.length} holes)`);
    });
    return lines;
  }, [comparison, newTeeKeys, selections]);
  const historicalReviewWarnings = useMemo(() => {
    if (!comparison) return [];
    return comparison.matchedTees
      .filter((tee) => tee.historicalUse.completedRoundCount > 0 && hasSelectedChanges(tee, selections))
      .map((tee) => {
        const count = tee.historicalUse.completedRoundCount;
        return `${tee.localTeeName} is referenced by ${count} completed ${count === 1 ? 'round' : 'rounds'}. These updates will modify the canonical course data those historical rounds reference.`;
      });
  }, [comparison, selections]);

  async function runComparison(nextManualMatches = manualMatches) {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/courses/${courseId}/update-course/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualMatches: nextManualMatches }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Failed to compare course data.');
      setComparison(body.comparison);
      setSelections({});
      setNewTeeKeys(new Set());
      setManualMatches(nextManualMatches);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Failed to compare course data.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function setKeys(keys: string[], selected: boolean) {
    setSelections((current) => {
      const next = { ...current };
      keys.forEach((key) => selected ? next[key] = true : delete next[key]);
      return next;
    });
  }

  function toggleField(tee: MatchedTeeComparison, field: ReconciliationFieldKey, selected: boolean) {
    const keys = [teeSelectionKey(tee.localTeeId, field)];
    if (selected && field === 'totalYards') {
      keys.push(...fieldSelectionKeys(tee, (candidate) => candidate.field === 'yardage'));
    }
    if (selected && field === 'parTotal') {
      keys.push(...fieldSelectionKeys(tee, (candidate) => candidate.field === 'par'));
    }
    setKeys(keys, selected);
  }

  function stageNewTee(providerTeeKey: string, selected: boolean) {
    setNewTeeKeys((current) => {
      const next = new Set(current);
      if (selected) next.add(providerTeeKey);
      else next.delete(providerTeeKey);
      return next;
    });
  }

  async function applySelected() {
    if (!comparison || !selectionCount) return;
    setApplying(true);
    try {
      const request = buildApplyRequest(comparison, selections, newTeeKeys);
      const response = await fetch(`/api/admin/courses/${courseId}/update-course/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409) setComparison(null);
        throw new Error(body.message || 'Failed to apply selected updates.');
      }
      showMessage(body.message || 'Selected course updates were applied.', 'success');
      await runComparison(manualMatches);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Failed to apply selected updates.', 'error');
    } finally {
      setApplying(false);
    }
  }

  function confirmApply() {
    const reviewMessage = [
      ...historicalReviewWarnings,
      ...(historicalReviewWarnings.length && reviewLines.length ? [''] : []),
      ...reviewLines.slice(0, 8),
      ...(reviewLines.length > 8 ? [`…and ${reviewLines.length - 8} more`] : []),
    ].join('\n');
    showConfirm({
      title: 'Apply Selected Course Updates?',
      message: reviewMessage,
      confirmText: 'Apply Updates',
      cancelText: 'Keep Reviewing',
      onConfirm: () => { void applySelected(); },
    });
  }

  if (!hasSingleMapping) {
    return (
      <section className="gps-admin-empty" role="alert">
        <h2>GolfCourseAPI mapping unavailable.</h2>
        <p>This course must have exactly one GolfCourseAPI mapping before it can be reconciled.</p>
      </section>
    );
  }

  return (
    <div className="reconciliation-workflow">
      <section className="card reconciliation-toolbar">
        <div>
          <h2>Provider Comparison</h2>
          <p>{comparison ? `Last checked ${new Date(comparison.comparedAt).toLocaleString()}` : 'No comparison loaded.'}</p>
        </div>
        <button className="btn btn-primary" type="button" disabled={loading || applying} onClick={() => void runComparison()}>
          {loading ? 'Checking…' : 'Check for Updates'}
        </button>
      </section>

      {comparison ? (
        <>
          <section className="reconciliation-summary" aria-label="Comparison summary">
            <span>{comparison.summary.matchedTeesWithDifferences} Tees Changed</span>
            <span>{comparison.summary.changedFields + comparison.summary.missingLocalFields} Field Differences</span>
            <span>{comparison.summary.newProviderTees} New Tees</span>
            <span>{comparison.summary.activeSessionBlockedTees} Active Round Locks</span>
          </section>

          {comparison.warnings.length ? (
            <section className="card reconciliation-warning" role="status">
              <h2>Comparison Warnings</h2>
              <ul>{comparison.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </section>
          ) : null}

          <label className="reconciliation-toggle">
            <input type="checkbox" checked={showUnchanged} onChange={(event) => setShowUnchanged(event.target.checked)} />
            Show Unchanged and Provider-Missing Fields
          </label>

          <section className="reconciliation-tee-list" aria-label="Matched tees">
            {comparison.matchedTees.map((tee) => {
              const visibleTeeFields = tee.fields.filter((field) => visibleField(field, showUnchanged));
              const visibleHoles = tee.holes.map((hole) => ({
                ...hole,
                fields: hole.fields.filter((field) => visibleField(field, showUnchanged)),
              })).filter((hole) => hole.fields.length);
              if (!showUnchanged && !tee.hasDifferences) return null;
              return (
                <article className="card reconciliation-tee-card" key={`${tee.localTeeId}:${tee.provider.providerTeeKey}`}>
                  <header>
                    <div>
                      <h2>{tee.localTeeName}</h2>
                      <p>{tee.localGender === 'male' ? 'Male' : 'Female'} · {tee.matchMethod.replace('-', ' ')}</p>
                    </div>
                    {tee.historicalUse.blockedByActiveSession
                      ? <span className="reconciliation-badge is-locked">Active Round in Progress</span>
                      : tee.malformedLocalData
                        ? <span className="reconciliation-badge is-warning">Invalid Local Data</span>
                        : tee.historicalUse.completedRoundCount > 0
                          ? <span className="reconciliation-badge is-warning">Used by {tee.historicalUse.completedRoundCount} Completed {tee.historicalUse.completedRoundCount === 1 ? 'Round' : 'Rounds'}</span>
                          : <span className="reconciliation-badge">Unused / Editable</span>}
                  </header>
                  {tee.historicalUse.blockedByActiveSession ? (
                    <p className="reconciliation-error">This tee cannot be updated while an active round is using it.</p>
                  ) : tee.historicalUse.completedRoundCount > 0 ? (
                    <p className="reconciliation-lock-note">Updating this tee may change course information shown for historical rounds.</p>
                  ) : null}

                  {!tee.historicalUse.blockedByActiveSession && !tee.malformedLocalData ? (
                    <div className="reconciliation-bulk-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => setKeys(fieldSelectionKeys(tee, () => true), true)}>Select All Changes</button>
                      <button type="button" className="btn btn-secondary" onClick={() => setKeys(fieldSelectionKeys(tee, (field) => field.field === 'courseRating' || field.field === 'slopeRating'), true)}>Select Rating &amp; Slope</button>
                      <button type="button" className="btn btn-secondary" onClick={() => setKeys(fieldSelectionKeys(tee, (field) => field.field === 'yardage'), true)}>Select Hole Yardages</button>
                      <button type="button" className="btn btn-secondary" onClick={() => setKeys(fieldSelectionKeys(tee, (field) => field.status === 'missingLocal'), true)}>Select Missing Values</button>
                      <button type="button" className="btn btn-secondary" onClick={() => setKeys(fieldSelectionKeys(tee, () => true), false)}>Clear Selection</button>
                    </div>
                  ) : null}

                  {visibleTeeFields.length ? (
                    <div className="reconciliation-table-wrap">
                      <table className="table reconciliation-diff-table">
                        <thead><tr><th>Field</th><th>GolfIQ</th><th>GolfCourseAPI</th><th>Apply</th></tr></thead>
                        <tbody>{visibleTeeFields.map((field) => (
                          <tr key={field.field}>
                            <th scope="row">{field.label}</th>
                            <td>{displayValue(field.localValue)}</td>
                            <td>{displayValue(field.providerValue)}</td>
                            <td><input
                              aria-label={`Apply ${field.label} for ${tee.localTeeName}`}
                              type="checkbox"
                              disabled={!field.selectable}
                              title={field.disabledReason}
                              checked={Boolean(selections[teeSelectionKey(tee.localTeeId, field.field)])}
                              onChange={(event) => toggleField(tee, field.field, event.target.checked)}
                            /></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  ) : null}

                  {visibleHoles.length ? <div className="reconciliation-holes">
                    <h3>Hole Differences</h3>
                    {visibleHoles.map((hole) => <div className="reconciliation-hole-row" key={hole.holeNumber}>
                      <strong>Hole {hole.holeNumber}</strong>
                      {hole.fields.map((field) => <label key={field.field} title={field.disabledReason}>
                        <input
                          type="checkbox"
                          disabled={!field.selectable}
                          checked={Boolean(selections[holeSelectionKey(tee.localTeeId, hole.holeNumber, field.field)])}
                          onChange={(event) => setKeys([holeSelectionKey(tee.localTeeId, hole.holeNumber, field.field)], event.target.checked)}
                        />
                        {field.label}: {displayValue(field.localValue)} → {displayValue(field.providerValue)}
                      </label>)}
                    </div>)}
                  </div> : null}
                </article>
              );
            })}
          </section>

          {comparison.unmatchedProviderTees.length ? (
            <section className="card reconciliation-new-tees">
              <h2>New or Unresolved Provider Tees</h2>
              {comparison.unmatchedProviderTees.map(({ provider, compatibleLocalTees, suggestedLocalTeeIds }) => (
                <article key={provider.providerTeeKey} className="reconciliation-new-tee">
                  <div>
                    <h3>{provider.descriptor.rawName || 'Unnamed Tee'}</h3>
                    <p>{provider.gender === 'male' ? 'Male' : 'Female'} · {provider.holes.length} holes · {displayValue(provider.courseRating.value)} / {displayValue(provider.slopeRating.value)} · {displayValue(provider.totalYards.value)} yards</p>
                    {suggestedLocalTeeIds.length ? <p className="reconciliation-suggestion">Possible local match found. Review before matching.</p> : null}
                    {provider.issues.map((issue) => <p className="reconciliation-error" key={issue}>{issue}</p>)}
                  </div>
                  <div className="reconciliation-new-actions">
                    <label>
                      <span>Match Existing Tee</span>
                      <select
                        aria-label={`Match ${provider.gender} ${provider.descriptor.rawName} to a local tee`}
                        value={manualChoices[provider.providerTeeKey] ?? ''}
                        onChange={(event) => setManualChoices((current) => ({ ...current, [provider.providerTeeKey]: event.target.value }))}
                      >
                        <option value="">Choose Tee</option>
                        {compatibleLocalTees.map((tee) => <option value={tee.id} key={tee.id}>{tee.teeName}</option>)}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!manualChoices[provider.providerTeeKey] || loading}
                      onClick={() => {
                        const next = [
                          ...manualMatches.filter((match) => match.providerTeeKey !== provider.providerTeeKey),
                          { providerTeeKey: provider.providerTeeKey, localTeeId: manualChoices[provider.providerTeeKey] },
                        ];
                        void runComparison(next);
                      }}
                    >Match Tee</button>
                    <label className="reconciliation-add-toggle">
                      <input
                        aria-label={`Add ${provider.gender} ${provider.descriptor.rawName} tee`}
                        type="checkbox"
                        disabled={!provider.supported}
                        checked={newTeeKeys.has(provider.providerTeeKey)}
                        onChange={(event) => stageNewTee(provider.providerTeeKey, event.target.checked)}
                      />
                      Add Tee
                    </label>
                  </div>
                </article>
              ))}
            </section>
          ) : null}

          {comparison.localOnlyTees.length ? (
            <section className="card reconciliation-local-only">
              <h2>Local Tees Not Present in GolfCourseAPI</h2>
              <p>These tees are informational only and will not be removed.</p>
              <ul>{comparison.localOnlyTees.map((tee) => <li key={tee.id}>{tee.teeName} ({tee.gender})</li>)}</ul>
            </section>
          ) : null}

          {!comparison.summary.changedFields && !comparison.summary.missingLocalFields && !comparison.unmatchedProviderTees.length ? (
            <section className="gps-admin-empty" role="status"><h2>No provider updates found.</h2></section>
          ) : null}

          <section className="card reconciliation-apply-bar">
            <div><strong>{selectionCount} Selected</strong><p>Selections remain staged until final confirmation.</p></div>
            <button className="btn btn-save" type="button" disabled={!selectionCount || applying} onClick={confirmApply}>
              {applying ? 'Applying…' : 'Review & Apply Selected Updates'}
            </button>
          </section>
        </>
      ) : null}
    </div>
  );
}
