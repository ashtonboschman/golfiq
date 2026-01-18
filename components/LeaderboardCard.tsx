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
  const formatHandicap = (hcp: number | null | undefined) => {
    if (hcp === null || hcp === undefined) return '-';
    const absValue = Math.abs(hcp).toFixed(1);
    return hcp < 0 ? `+${absValue}` : absValue;
  };

  const formatToPar = (toPar: number | null | undefined) => {
    if (toPar === null || toPar === undefined) return '-';
    const absValue = Math.abs(toPar).toFixed(1);
    if (toPar > 0) return `+${absValue}`;
    if (toPar < 0) return `-${absValue}`;
    return 'E'; // Even par
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

        <div className="leaderboard-cell centered">{formatToPar(user.average_score)}</div>

        <div className="leaderboard-cell centered">{formatToPar(user.best_score)}</div>
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
