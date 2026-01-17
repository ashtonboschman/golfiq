import Link from 'next/link';

interface LeaderboardUser {
  user_id: number;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  handicap: number | null;
  average_score: number | null;
  best_score: number | null;
}

interface LeaderboardCardProps {
  user: LeaderboardUser;
  rank: number;
  isCurrentUser: boolean;
}

export default function LeaderboardCard({ user, rank, isCurrentUser }: LeaderboardCardProps) {
  const formatNumber = (num: number | null | undefined, decimals = 0) =>
    num !== null && num !== undefined ? num.toFixed(decimals) : '-';

  const formatHandicap = (hcp: number | null | undefined) => {
    if (hcp === null || hcp === undefined) return '-';
    const absValue = Math.abs(hcp).toFixed(1);
    return hcp < 0 ? `+${absValue}` : absValue;
  };

  const cardContent = (
    <div className={`card leaderboard-card ${isCurrentUser ? 'current-user' : ''}`}>
      <div className="leaderboard-row">
        <div className="leaderboard-cell left">{rank}</div>

        <div className="leaderboard-cell left">
          <div className="avatar-name-wrapper">
            {user.avatar_url && (
              <img
                src={user.avatar_url}
                alt={`${user.first_name} ${user.last_name}`}
                className="leaderboard-avatar"
              />
            )}
            <div className="name-stack">
              <span className="first-name">{user.first_name}</span>
              <span className="last-name">
                {user.last_name ? `${user.last_name[0]}.` : ''}
              </span>
            </div>
          </div>
        </div>

        <div className="leaderboard-cell centered">{formatHandicap(user.handicap)}</div>

        <div className="leaderboard-cell centered">{formatNumber(user.average_score, 1)}</div>

        <div className="leaderboard-cell centered">{user.best_score ?? '-'}</div>
      </div>
    </div>
  );

  // Don't link to your own profile from leaderboard
  if (isCurrentUser) {
    return cardContent;
  }

  return (
    <Link href={`/users/${user.user_id}`} className="card-link">
      {cardContent}
    </Link>
  );
}
