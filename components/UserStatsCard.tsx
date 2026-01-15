interface Stats {
  handicap?: number | null;
  average_score?: number | null;
  best_score?: number | null;
  total_rounds?: number | null;
}

interface UserStatsCardProps {
  stats: Stats;
}

export default function UserStatsCard({ stats }: UserStatsCardProps) {
  const format = (val: number | null | undefined) => (val === null || val === undefined ? '-' : val);

  // Show + only for negative numbers
  const formatHandicap = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    return val < 0 ? `+${Math.abs(val)}` : val;
  };

  return (
    <div className="card">
      <label className="form-label">Handicap:</label>
      <input
        type="text"
        value={formatHandicap(stats.handicap)}
        disabled={true}
        className="form-input"
      />

      <label className="form-label">Average Score:</label>
      <input
        type="text"
        value={format(stats.average_score)}
        disabled={true}
        className="form-input"
      />

      <label className="form-label">Best Score:</label>
      <input type="text" value={format(stats.best_score)} disabled={true} className="form-input" />

      <label className="form-label">Total Rounds:</label>
      <input
        type="text"
        value={format(stats.total_rounds)}
        disabled={true}
        className="form-input"
      />
    </div>
  );
}
