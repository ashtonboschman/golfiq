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
  rank: number;             // numeric rank for ordering
  rankDisplay?: string;     // what shows on UI: "1", "T1", etc.
  isCurrentUser: boolean;
}

export default function LeaderboardCard({
  user,
  rank,
  rankDisplay,
  isCurrentUser,
}: LeaderboardCardProps) {
  // Format HCP: negative = "−", positive = "+"
  const formatHandicap = (hcp: number | null | undefined) => {
    if (hcp === null || hcp === undefined) return '-';
    const absValue = Math.abs(hcp).toFixed(1);
    return hcp < 0 ? `+${absValue}` : absValue;
  };

  // Format ToPar: negative = "-X.X", positive = "+X.X", zero = "E"
  const formatToPar = (toPar: number | null | undefined, decimals = 1) => {
    if (toPar === null || toPar === undefined) return '-';
    if (toPar === 0) return 'E';
    const absValue = Math.abs(toPar).toFixed(decimals);
    return toPar > 0 ? `+${absValue}` : `-${absValue}`;
  };

  const cardContent = (
    <div className={`card leaderboard-card ${isCurrentUser ? 'current-user' : ''}`}>
      <div className="leaderboard-row">
        {/* Rank column */}
        <div className="leaderboard-cell left">{rankDisplay ?? rank}</div>

        {/* Name + avatar */}
        <div className="leaderboard-cell left">
          <div className="avatar-name-wrapper">
            {user.avatar_url && (
              <img
                src={user.avatar_url}
                alt={`${user.first_name} ${user.last_name ?? ''}`}
                className="leaderboard-avatar"
              />
            )}
            <div className="name-stack">
              <span className="first-name">{user.first_name}</span>
              <span className="last-name">{user.last_name ? `${user.last_name[0]}.` : ''}</span>
            </div>
          </div>
        </div>

        {/* Handicap */}
        <div className="leaderboard-cell centered">{formatHandicap(user.handicap)}</div>

        {/* Average score */}
        <div className="leaderboard-cell centered">{formatToPar(user.average_score)}</div>

        {/* Best score */}
        <div className="leaderboard-cell centered">{formatToPar(user.best_score, 0)}</div>
      </div>
    </div>
  );

  // Don't link to your own profile
  if (isCurrentUser) return cardContent;

  return (
    <Link href={`/users/${user.user_id}`} className="card-link">
      {cardContent}
    </Link>
  );
}