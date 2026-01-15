import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { FriendUser } from '@/lib/friendUtils';
import { Check, Plus, UserCheck2, UserPlus2, UserRoundCog, X } from 'lucide-react';

interface FriendCardProps {
  friend: FriendUser;
  onAction?: (id: number, action: string, friend?: FriendUser) => Promise<void>;
  showDetails?: boolean;
}

export default function FriendCard({ friend, onAction, showDetails = true }: FriendCardProps) {
  const { data: session } = useSession();
  const currentUserId = Number(session?.user?.id);

  const [loading, setLoading] = useState(false);
  if (!friend) return null;

  const targetUserId =
    friend.type === 'incoming' || friend.type === 'outgoing' ? friend.user_id : friend.id;

  const actionId = friend.id;

  const handleClick = async (action: string) => {
    if (!onAction || loading || !actionId) return;
    setLoading(true);
    try {
      await onAction(actionId, action, friend);
    } finally {
      setLoading(false);
    }
  };

  const type = friend.type || 'none';

  // Format handicap like on dashboard
  const formatHandicap = (num: number | null | undefined) => {
    if (num == null || isNaN(num)) return '-';
    if (num < 0) return `+${Math.abs(num)}`;
    return num % 1 === 0 ? num : num.toFixed(1);
  };

  const formatNumber = (num: number | null | undefined) =>
    num == null || isNaN(num) ? '-' : num % 1 === 0 ? num : num.toFixed(1);

  return (
    <div className="friend-card">
      <Link href={`/users/${targetUserId}`} className="friend-info clickable">
        <img
          className="friend-img"
          src={friend.avatar_url || '/avatars/default.png'}
          alt={`${friend.first_name || ''} ${friend.last_name || ''}`}
        />
        <div className="friend-details">
          <div className="friend-name">
            {friend.first_name} {friend.last_name}
          </div>
          <div className="friend-stats">
            <span className="stat-item">
              <span className="stat-label">Hcp:</span> {formatHandicap(friend.handicap)}
            </span>
            <span className="stat-item">
              <span className="stat-label">Avg:</span> {formatNumber(friend.average_score)}
            </span>
            <span className="stat-item">
              <span className="stat-label">Best:</span> {friend.best_score ?? '-'}
            </span>
            <span className="stat-item">
              <span className="stat-label">Rnds:</span> {friend.total_rounds ?? '-'}
            </span>
          </div>
        </div>
      </Link>
      <div className="friend-actions">
        {type === 'none' && (
          <button className="btn btn-save" onClick={() => handleClick('send')} disabled={loading}>
            {loading ? 'Sending...' : <UserPlus2/>}
          </button>
        )}
        {type === 'incoming' &&
          (showDetails ? (
            <>
              <button
                className="btn btn-reject"
                onClick={() => handleClick('decline')}
                disabled={loading}
              >
                {loading ? 'Declining...' : <X/>}
              </button>
              <button
                className="btn btn-accept"
                onClick={() => handleClick('accept')}
                disabled={loading}
              >
                {loading ? 'Accepting...' : <Check/>}
              </button>
            </>
          ) : (
            <button className="btn btn-disabled" disabled>
              <UserRoundCog/>
            </button>
          ))}
        {type === 'outgoing' &&
          (showDetails ? (
            <button
              className="btn btn-cancel"
              onClick={() => handleClick('cancel')}
              disabled={loading}
            >
              {loading ? 'Cancelling...' : <X/>}
            </button>
          ) : (
            <button className="btn btn-disabled" disabled>
              <UserRoundCog/>
            </button>
          ))}
        {type === 'friend' &&
          (showDetails ? (
            <></>
          ) : (
            <button className="btn btn-friends" disabled>
              <UserCheck2/>
            </button>
          ))}
      </div>
    </div>
  );
}
