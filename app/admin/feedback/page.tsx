'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { MessageSquare, RefreshCw, Save } from 'lucide-react';
import { useMessage } from '@/app/providers';
import { AdminPanelSkeleton } from '@/components/skeleton/PageSkeletons';
import Select from 'react-select';
import { selectStyles } from '@/lib/selectStyles';

type FeedbackStatus = 'open' | 'in_review' | 'resolved' | 'closed';
type FeedbackType = 'bug' | 'idea' | 'other';

type FeedbackEntry = {
  id: string;
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  type: FeedbackType;
  message: string;
  page: string | null;
  appVersion: string | null;
  status: FeedbackStatus;
  createdAt: string;
  updatedAt: string;
};

const STATUS_OPTIONS: Array<{ value: FeedbackStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In Review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const TYPE_OPTIONS: Array<{ value: 'all' | FeedbackType; label: string }> = [
  { value: 'all', label: 'All Types' },
  { value: 'bug', label: 'Bug' },
  { value: 'idea', label: 'Idea' },
  { value: 'other', label: 'Other' },
];

const FILTER_STATUS_OPTIONS: Array<{ value: 'all' | FeedbackStatus; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  ...STATUS_OPTIONS,
];

export default function AdminFeedbackPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { showMessage, clearMessage } = useMessage();

  const [authChecked, setAuthChecked] = useState(false);
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | FeedbackType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | FeedbackStatus>('all');
  const [draftStatusById, setDraftStatusById] = useState<Record<string, FeedbackStatus>>({});

  useEffect(() => {
    if (status === 'loading') return;

    if (session?.user?.id !== '1') {
      router.push('/');
      return;
    }

    setAuthChecked(true);
  }, [status, session, router]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (search.trim()) params.set('search', search.trim());
    return params.toString();
  }, [typeFilter, statusFilter, search]);

  const loadFeedback = useCallback(async () => {
    setLoadingFeedback(true);

    try {
      const endpoint = queryParams ? `/api/admin/feedback?${queryParams}` : '/api/admin/feedback';
      const response = await fetch(endpoint, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to load feedback submissions.');
      }

      const items = Array.isArray(data.feedback) ? data.feedback : [];
      setEntries(items);
      setDraftStatusById(
        items.reduce((acc: Record<string, FeedbackStatus>, entry: FeedbackEntry) => {
          acc[entry.id] = entry.status;
          return acc;
        }, {}),
      );
    } catch (error: any) {
      console.error('Admin feedback fetch error:', error);
      showMessage(error?.message || 'Failed to load feedback submissions.', 'error');
    } finally {
      setLoadingFeedback(false);
    }
  }, [queryParams, showMessage]);

  useEffect(() => {
    if (!authChecked) return;
    loadFeedback();
  }, [authChecked, loadFeedback]);

  const handleStatusSave = async (id: string) => {
    const nextStatus = draftStatusById[id];
    const current = entries.find((entry) => entry.id === id);
    if (!current || !nextStatus || current.status === nextStatus) return;

    setSavingId(id);
    try {
      const response = await fetch('/api/admin/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: nextStatus }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to update feedback status.');
      }

      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                status: nextStatus,
                updatedAt: data?.feedback?.updatedAt || entry.updatedAt,
              }
            : entry,
        ),
      );
      showMessage('Feedback status updated.', 'success');
    } catch (error: any) {
      console.error('Feedback status update error:', error);
      showMessage(error?.message || 'Failed to update feedback status.', 'error');
      setDraftStatusById((prev) => ({
        ...prev,
        [id]: current.status,
      }));
    } finally {
      setSavingId(null);
    }
  };

  if (status === 'loading' || !authChecked) {
    return <AdminPanelSkeleton />;
  }

  return (
    <div className="page-stack">
      <div className="card admin-feedback-header-card">
        <div className="admin-feedback-title-row">
          <div className="admin-feedback-title-wrap">
            <MessageSquare size={20} />
            <h2 className="admin-feedback-title">Feedback Submissions</h2>
          </div>
          <button
            type="button"
            className="btn btn-secondary admin-feedback-refresh-btn"
            onClick={() => {
              clearMessage();
              loadFeedback();
            }}
            disabled={loadingFeedback}
          >
            <RefreshCw size={16} /> {loadingFeedback ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <p className="admin-feedback-subtitle">
          Review feedback submitted from Settings. Use filters to find specific reports and update status as you triage.
        </p>

        <div className="admin-feedback-filters">
          <input
            type="text"
            className="form-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search message, email, page, app version..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                loadFeedback();
              }
            }}
          />

          <Select
            inputId="admin-feedback-type-filter"
            className="admin-feedback-filter-select"
            value={TYPE_OPTIONS.find((option) => option.value === typeFilter)}
            onChange={(option) => {
              if (!option) return;
              setTypeFilter(option.value as 'all' | FeedbackType);
            }}
            options={TYPE_OPTIONS}
            isSearchable={false}
            styles={selectStyles}
          />

          <Select
            inputId="admin-feedback-status-filter"
            className="admin-feedback-filter-select"
            value={FILTER_STATUS_OPTIONS.find((option) => option.value === statusFilter)}
            onChange={(option) => {
              if (!option) return;
              setStatusFilter(option.value as 'all' | FeedbackStatus);
            }}
            options={FILTER_STATUS_OPTIONS}
            isSearchable={false}
            styles={selectStyles}
          />

          <button type="button" className="btn btn-secondary" onClick={loadFeedback} disabled={loadingFeedback}>
            Apply
          </button>
        </div>
      </div>

      <div className="card admin-feedback-table-card">
        {loadingFeedback ? (
          <p className="settings-placeholder admin-feedback-empty-state">Loading feedback submissions...</p>
        ) : entries.length === 0 ? (
          <p className="settings-placeholder admin-feedback-empty-state">No feedback submissions found for the selected filters.</p>
        ) : (
          <div className="admin-feedback-table-wrapper">
            <table className="admin-feedback-table">
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>User</th>
                  <th>Type</th>
                  <th>Message</th>
                  <th>Context</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const draftStatus = draftStatusById[entry.id] || entry.status;
                  const statusChanged = draftStatus !== entry.status;
                  const fullName = [entry.firstName, entry.lastName].filter(Boolean).join(' ').trim();

                  return (
                    <tr key={entry.id}>
                      <td>{new Date(entry.createdAt).toLocaleString()}</td>
                      <td>
                        <div className="admin-feedback-user-cell">
                          <strong>{fullName || 'Unknown User'}</strong>
                          <span>{entry.email}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`admin-feedback-pill admin-feedback-pill-${entry.type}`}>
                          {entry.type}
                        </span>
                      </td>
                      <td>
                        <p className="admin-feedback-message">{entry.message}</p>
                      </td>
                      <td>
                        <div className="admin-feedback-context-cell">
                          <span>{entry.page || 'n/a'}</span>
                          <span>{entry.appVersion || 'n/a'}</span>
                        </div>
                      </td>
                      <td>
                        <select
                          className="form-input admin-feedback-status-select"
                          value={draftStatus}
                          onChange={(e) =>
                            setDraftStatusById((prev) => ({
                              ...prev,
                              [entry.id]: e.target.value as FeedbackStatus,
                            }))
                          }
                          disabled={savingId === entry.id}
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary admin-feedback-save-btn"
                          onClick={() => handleStatusSave(entry.id)}
                          disabled={savingId === entry.id || !statusChanged}
                        >
                          <Save size={14} /> {savingId === entry.id ? 'Saving...' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
