'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMessage } from '@/app/providers';
import { useOptionalFriends } from '@/context/FriendsContext';
import { SkeletonBlock } from '@/components/skeleton/Skeleton';

type BlockedUser = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string;
  blocked_at?: string;
};

export default function BlockedUsersPage() {
  const { status } = useSession();
  const router = useRouter();
  const { showConfirm, showMessage } = useMessage();
  const friendsContext = useOptionalFriends();
  const refreshFriends = friendsContext?.fetchAll;

  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [blockedUsersLoading, setBlockedUsersLoading] = useState(true);
  const [unblockingUserId, setUnblockingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?redirect=/settings/blocked-users');
    }
  }, [status, router]);

  useEffect(() => {
    const loadBlockedUsers = async () => {
      if (status !== 'authenticated') {
        setBlockedUsers([]);
        setBlockedUsersLoading(status === 'loading');
        return;
      }

      setBlockedUsersLoading(true);
      try {
        const response = await fetch('/api/users/blocked', { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || 'Failed to load blocked users.');
        }

        setBlockedUsers(Array.isArray(data.users) ? data.users : []);
      } catch (error: any) {
        console.error('Blocked users fetch error:', error);
        showMessage(error?.message || 'Failed to load blocked users.', 'error');
        setBlockedUsers([]);
      } finally {
        setBlockedUsersLoading(false);
      }
    };

    loadBlockedUsers();
  }, [status, showMessage]);

  const handleUnblockUser = (blockedUserId: string) => {
    showConfirm({
      title: 'Unblock user?',
      message: 'This user will be able to send you friend requests again.',
      confirmText: 'Unblock',
      cancelText: 'Cancel',
      variant: 'neutral',
      confirmVariant: 'neutral',
      onConfirm: async () => {
        setUnblockingUserId(blockedUserId);
        try {
          const response = await fetch(`/api/users/${blockedUserId}/block`, {
            method: 'DELETE',
          });
          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(data.message || 'Failed to unblock user.');
          }

          setBlockedUsers((prev) => prev.filter((user) => user.id !== blockedUserId));
          if (refreshFriends) {
            await refreshFriends();
          }
          showMessage(data.message || 'User unblocked.', 'success');
        } catch (error: any) {
          console.error('Unblock user error:', error);
          showMessage(error?.message || 'Failed to unblock user.', 'error');
        } finally {
          setUnblockingUserId(null);
        }
      },
    });
  };

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="page-stack">
      <section className="settings-section">
        <div className="settings-card">
          <div className="settings-blocked-page-header">
            <h1 className="settings-blocked-page-title">Blocked Users</h1>
            <p className="settings-blocked-helper">
              Blocked users cannot send you friend requests.
            </p>
          </div>

          {blockedUsersLoading ? (
            <div className="settings-blocked-list">
              <SkeletonBlock height={56} />
            </div>
          ) : blockedUsers.length === 0 ? (
            <p className="secondary-text">You have not blocked anyone.</p>
          ) : (
            <div className="settings-blocked-list">
              {blockedUsers.map((blockedUser) => {
                const fullName =
                  `${blockedUser.first_name ?? ''} ${blockedUser.last_name ?? ''}`.trim() || 'Unknown user';

                return (
                  <div className="settings-blocked-item" key={blockedUser.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={blockedUser.avatar_url || '/avatars/default.png'}
                      alt={`${fullName} avatar`}
                      className="settings-blocked-avatar"
                    />
                    <div className="settings-blocked-details">
                      <span className="settings-blocked-name">{fullName}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary settings-blocked-action"
                      onClick={() => handleUnblockUser(blockedUser.id)}
                      disabled={unblockingUserId === blockedUser.id}
                    >
                      {unblockingUserId === blockedUser.id ? 'Unblocking...' : 'Unblock'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
