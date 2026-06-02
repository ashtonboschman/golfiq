'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOptionalFriends } from '@/context/FriendsContext';
import { useMessage } from '@/app/providers';

interface Permissions {
  can_view_dashboard?: boolean;
}

interface Relationship {
  is_self?: boolean;
  status?: string;
  blocked_by_viewer?: boolean;
  blocked_viewer?: boolean;
}

interface UserActionsCardProps {
  userId: number | string;
  permissions?: Permissions;
  relationship?: Relationship;
}

const REPORT_REASONS = [
  {
    value: 'inappropriate_profile_or_avatar',
    label: 'Inappropriate profile or avatar',
  },
  {
    value: 'harassment_or_abuse',
    label: 'Harassment or abuse',
  },
  {
    value: 'spam_or_fake_account',
    label: 'Spam or fake account',
  },
  {
    value: 'other',
    label: 'Other',
  },
] as const;

type ReportReason = (typeof REPORT_REASONS)[number]['value'];

export default function UserActionsCard({ userId, permissions, relationship }: UserActionsCardProps) {
  const friendsContext = useOptionalFriends();
  const { showConfirm, showMessage } = useMessage();
  const router = useRouter();
  const friends = friendsContext?.friends ?? [];
  const incomingRequests = friendsContext?.incomingRequests ?? [];
  const outgoingRequests = friendsContext?.outgoingRequests ?? [];
  const handleFriendAction = friendsContext?.handleAction;
  const refreshFriends = friendsContext?.fetchAll;

  const [loadingAction, setLoadingAction] = useState('');
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('inappropriate_profile_or_avatar');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [blockActionLoading, setBlockActionLoading] = useState(false);
  const [isBlockedByViewer, setIsBlockedByViewer] = useState(Boolean(relationship?.blocked_by_viewer));

  if (!userId) return null;

  if (relationship?.is_self) {
    return null;
  }

  // Convert userId to number for comparison (API returns id as string)
  const userIdNum = typeof userId === 'string' ? Number(userId) : userId;
  const blockedViewer = Boolean(relationship?.blocked_viewer);
  const eitherBlocked = blockedViewer || isBlockedByViewer;

  // Determine relationship type and actionId (request ID or user ID)
  let relationshipType = 'none';
  let actionId = userIdNum; // default for add/remove

  const friend = friends.find((f) => f.user_id === userIdNum);
  const incoming = incomingRequests.find((r) => r.user_id === userIdNum);
  const outgoing = outgoingRequests.find((r) => r.user_id === userIdNum);

  if (friend) {
    relationshipType = 'friend';
  } else if (incoming) {
    relationshipType = 'incoming';
    actionId = incoming.id!; // use request record ID
  } else if (outgoing) {
    relationshipType = 'outgoing';
    actionId = outgoing.id!; // use request record ID
  } else if (!friendsContext) {
    if (relationship?.status === 'friends') {
      relationshipType = 'friend';
    } else if (relationship?.status === 'pending_received') {
      relationshipType = 'incoming';
    } else if (relationship?.status === 'pending_sent') {
      relationshipType = 'outgoing';
    }
  }

  const performAction = async (action: string) => {
    if (!handleFriendAction) {
      showMessage('Social actions are unavailable right now.', 'error');
      return;
    }

    setLoadingAction(action);
    try {
      await handleFriendAction(actionId, action, {
        first_name: incoming?.first_name || outgoing?.first_name || friend?.first_name,
        last_name: incoming?.last_name || outgoing?.last_name || friend?.last_name,
        avatar_url: incoming?.avatar_url || outgoing?.avatar_url || friend?.avatar_url,
      });
    } finally {
      setLoadingAction('');
    }
  };

  const submitReport = async () => {
    setSubmittingReport(true);
    try {
      const response = await fetch(`/api/users/${userIdNum}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reportReason,
          details: reportDetails.trim().length ? reportDetails.trim() : null,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Unable to submit report right now.');
      }

      showMessage(data.message || 'Thanks. Your report was submitted.', 'success');
      setShowReportForm(false);
      setReportReason('inappropriate_profile_or_avatar');
      setReportDetails('');
    } catch (error: any) {
      showMessage(error.message || 'Unable to submit report right now.', 'error');
    } finally {
      setSubmittingReport(false);
    }
  };

  const toggleBlock = () => {
    const targetAction = isBlockedByViewer ? 'unblock' : 'block';
    const confirmMessage = isBlockedByViewer
      ? 'Unblock this user?'
      : 'Block this user? Blocked users cannot send you friend requests.';

    showConfirm({
      message: confirmMessage,
      onConfirm: async () => {
        setBlockActionLoading(true);
        try {
          const response = await fetch(`/api/users/${userIdNum}/block`, {
            method: targetAction === 'block' ? 'POST' : 'DELETE',
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.message || 'Unable to update block setting.');
          }

          setIsBlockedByViewer(targetAction === 'block');
          setShowReportForm(false);
          setReportDetails('');
          if (refreshFriends) {
            await refreshFriends();
          }
          showMessage(
            targetAction === 'block' ? 'User blocked.' : 'User unblocked.',
            'success',
          );
        } catch (error: any) {
          showMessage(error.message || 'Unable to update block setting.', 'error');
        } finally {
          setBlockActionLoading(false);
        }
      },
    });
  };

  return (
    <div className="card">
      {permissions?.can_view_dashboard && (
        <button
          className="btn btn-add"
          onClick={() => router.push(`/dashboard?user_id=${userId}`)}
        >
          View Dashboard
        </button>
      )}

      {!eitherBlocked && relationshipType === 'none' && (
        <button
          className="btn btn-save"
          onClick={() => performAction('send')}
          disabled={loadingAction === 'send'}
        >
          {loadingAction === 'send' ? 'Sending...' : 'Send Friend Request'}
        </button>
      )}

      {!eitherBlocked && relationshipType === 'outgoing' && (
        <button
          className="btn btn-cancel"
          onClick={() => performAction('cancel')}
          disabled={loadingAction === 'cancel'}
        >
          {loadingAction === 'cancel' ? 'Cancelling...' : 'Cancel Friend Request'}
        </button>
      )}

      {!eitherBlocked && relationshipType === 'incoming' && (
        <div className="form-actions">
          <button
            className="btn btn-cancel"
            onClick={() => performAction('decline')}
            disabled={loadingAction === 'decline'}
          >
            {loadingAction === 'decline' ? 'Declining...' : 'Decline Friend Request'}
          </button>
          <button
            className="btn btn-accept"
            onClick={() => performAction('accept')}
            disabled={loadingAction === 'accept'}
          >
            {loadingAction === 'accept' ? 'Accepting...' : 'Accept Friend Request'}
          </button>
        </div>
      )}

      {!eitherBlocked && relationshipType === 'friend' && (
        <button
          className="btn btn-remove"
          onClick={() => performAction('remove')}
          disabled={loadingAction === 'remove'}
        >
          {loadingAction === 'remove' ? 'Removing...' : 'Remove Friend'}
        </button>
      )}

      {blockedViewer && (
        <p className="secondary-text">This user has blocked you.</p>
      )}

      {isBlockedByViewer && (
        <p className="secondary-text">Blocked users cannot send you friend requests.</p>
      )}

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setShowReportForm((prev) => !prev)}
          disabled={submittingReport || blockActionLoading}
        >
          Report user
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={toggleBlock}
          disabled={submittingReport || blockActionLoading}
        >
          {blockActionLoading
            ? (isBlockedByViewer ? 'Unblocking...' : 'Blocking...')
            : (isBlockedByViewer ? 'Unblock user' : 'Block user')}
        </button>
      </div>

      {showReportForm && (
        <div className="user-actions-report-form">
          <label className="form-label" htmlFor="report-reason">
            Why are you reporting this user?
          </label>
          <select
            id="report-reason"
            className="form-input"
            value={reportReason}
            disabled={submittingReport}
            onChange={(event) => {
              setReportReason(event.target.value as ReportReason);
            }}
          >
            {REPORT_REASONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <textarea
            className="form-input"
            value={reportDetails}
            disabled={submittingReport}
            onChange={(event) => setReportDetails(event.target.value)}
            placeholder="Optional details"
            maxLength={1000}
            rows={3}
            aria-label="Report details"
          />
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-cancel"
              onClick={() => setShowReportForm(false)}
              disabled={submittingReport}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-save"
              onClick={submitReport}
              disabled={submittingReport}
            >
              {submittingReport ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
