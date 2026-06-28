import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { FriendUser } from '@/lib/friendUtils';
import { Check, ChevronRight, UserCheck2, UserPlus2, UserRoundCog, X } from 'lucide-react';
import { SkeletonCircle } from '@/components/skeleton/Skeleton';

interface FriendCardProps {
  friend: FriendUser;
  onAction?: (id: number, action: string, friend?: FriendUser) => Promise<void>;
  showDetails?: boolean;
}

export default function FriendCard({ friend, onAction, showDetails = true }: FriendCardProps) {
  const { data: session } = useSession();
  const currentUserId = Number(session?.user?.id);

  const [loading, setLoading] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
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

  // If user has no rounds, show '-' for all stats
  const hasRounds = friend.total_rounds != null && friend.total_rounds > 0;

  // Format handicap like on dashboard (positive handicap shows as-is, negative shows with +)
  const formatHandicap = (num: number | null | undefined) => {
    if (!hasRounds || num == null || isNaN(num)) return '-';
    const absValue = Math.abs(num).toFixed(1);
    return num < 0 ? `+${absValue}` : absValue;
  };

  // Format to-par values (positive shows +, negative shows -, zero shows E)
  const formatToPar = (toPar: number | null | undefined, decimals = 1) => {
    if (!hasRounds || toPar == null || isNaN(toPar)) return '-';
    const absValue = Math.abs(toPar).toFixed(decimals);
    if (toPar > 0) return `+${absValue}`;
    if (toPar < 0) return `-${absValue}`;
    return 'E';
  };

  return (
    <div className="friend-card">
      <Link href={`/users/${targetUserId}`} className="friend-info clickable">
        <div className="friend-avatar">
          {!avatarLoaded && <SkeletonCircle size={48} />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={`friend-img${avatarLoaded ? ' is-loaded' : ''}`}
            src={friend.avatar_url || '/avatars/default.png'}
            alt={`${friend.first_name || ''} ${friend.last_name || ''}`}
            width={48}
            height={48}
            onLoad={() => setAvatarLoaded(true)}
            onError={(event) => {
              if (!event.currentTarget.src.endsWith('/avatars/default.png')) {
                event.currentTarget.src = '/avatars/default.png';
              } else {
                setAvatarLoaded(true);
              }
            }}
          />
        </div>
        <div className="friend-details">
          <div className="friend-name">
            {friend.first_name} {friend.last_name}
          </div>
          {type === 'friend' && (
            <div className="friend-stats">
              <span className="stat-item">
                <span className="stat-label">HCP</span> {formatHandicap(friend.handicap)}
              </span>
              <span className="stat-item">
                <span className="stat-label">Avg</span> {formatToPar(friend.average_score)}
              </span>
              <span className="stat-item">
                <span className="stat-label">Best</span> {formatToPar(friend.best_score, 0)}
              </span>
              <span className="stat-item">
                <span className="stat-label">Rnds</span> {hasRounds ? friend.total_rounds : '-'}
              </span>
            </div>
          )}
        </div>
      </Link>
      <div className="friend-actions">
        {type === 'none' && (
          <button
            className="btn btn-save"
            onClick={() => handleClick('send')}
            disabled={loading}
            aria-label="Send Friend Request"
            aria-busy={loading}
            title="Send Friend Request"
          >
            <UserPlus2/>
          </button>
        )}
        {type === 'incoming' &&
          (showDetails ? (
            <>
              <button
                className="btn btn-reject"
                onClick={() => handleClick('decline')}
                disabled={loading}
                aria-label="Decline Friend Request"
                aria-busy={loading}
                title="Decline Friend Request"
              >
                <X/>
              </button>
              <button
                className="btn btn-accept"
                onClick={() => handleClick('accept')}
                disabled={loading}
                aria-label="Accept Friend Request"
                aria-busy={loading}
                title="Accept Friend Request"
              >
                <Check/>
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
              aria-label="Cancel Friend Request"
              aria-busy={loading}
              title="Cancel Friend Request"
            >
              <X/>
            </button>
          ) : (
            <button className="btn btn-disabled" disabled>
              <UserRoundCog/>
            </button>
          ))}
        {type === 'friend' &&
          (showDetails ? (
            <Link href={`/users/${targetUserId}`} className="chevron-link">
              <ChevronRight className='primary-text'/>
            </Link>
          ) : (
            <button className="btn btn-friends" disabled>
              <UserCheck2/>
            </button>
          ))}
      </div>
    </div>
  );
}
