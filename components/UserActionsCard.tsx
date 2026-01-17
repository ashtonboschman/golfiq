'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFriends } from '@/context/FriendsContext';

interface Permissions {
  can_view_dashboard?: boolean;
}

interface UserActionsCardProps {
  userId: number | string;
  permissions?: Permissions;
}

export default function UserActionsCard({ userId, permissions }: UserActionsCardProps) {
  const { friends, incomingRequests, outgoingRequests, handleAction } = useFriends();
  const router = useRouter();

  const [loadingAction, setLoadingAction] = useState('');

  if (!userId) return null;

  // Convert userId to number for comparison (API returns id as string)
  const userIdNum = typeof userId === 'string' ? Number(userId) : userId;

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
  }

  const performAction = async (action: string) => {
    setLoadingAction(action);
    try {
      await handleAction(actionId, action, {
        first_name: incoming?.first_name || outgoing?.first_name || friend?.first_name,
        last_name: incoming?.last_name || outgoing?.last_name || friend?.last_name,
        avatar_url: incoming?.avatar_url || outgoing?.avatar_url || friend?.avatar_url,
      });
    } finally {
      setLoadingAction('');
    }
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

      {relationshipType === 'none' && (
        <button
          className="btn btn-save"
          onClick={() => performAction('send')}
          disabled={loadingAction === 'send'}
        >
          {loadingAction === 'send' ? 'Sending...' : 'Send Friend Request'}
        </button>
      )}

      {relationshipType === 'outgoing' && (
        <button
          className="btn btn-cancel"
          onClick={() => performAction('cancel')}
          disabled={loadingAction === 'cancel'}
        >
          {loadingAction === 'cancel' ? 'Cancelling...' : 'Cancel Friend Request'}
        </button>
      )}

      {relationshipType === 'incoming' && (
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

      {relationshipType === 'friend' && (
        <button
          className="btn btn-remove"
          onClick={() => performAction('remove')}
          disabled={loadingAction === 'remove'}
        >
          {loadingAction === 'remove' ? 'Removing...' : 'Remove Friend'}
        </button>
      )}
    </div>
  );
}
