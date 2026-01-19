interface Stats {
  handicap?: number | null;
  average_to_par?: number | null;
  best_to_par?: number | null;
  total_rounds?: number | null;
}

interface UserStatsCardProps {
  stats: Stats;
}

export default function UserStatsCard({ stats }: UserStatsCardProps) {
  const format = (val: number | null | undefined) => (val === null || val === undefined ? '-' : val);

  // Show + for positive handicap (scratch/plus handicap)
  const formatHandicap = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    return val < 0 ? `+${Math.abs(val)}` : val;
  };

  const formatToPar = (toPar: number | null | undefined, decimals = 1) => {
    if (toPar === null || toPar === undefined) return '-';
    const absValue = Math.abs(toPar).toFixed(decimals);
    if (toPar > 0) return `+${absValue}`;
    if (toPar < 0) return `-${absValue}`;
    return 'E'; // Even par
  };

  return (
    <div className="card">
      <label className="form-label">Handicap</label>
      <input
        type="text"
        value={formatHandicap(stats.handicap)}
        disabled={true}
        className="form-input"
      />

      <label className="form-label">Average To Par</label>
      <input
        type="text"
        value={formatToPar(stats.average_to_par)}
        disabled={true}
        className="form-input"
      />

      <label className="form-label">Best To Par</label>
      <input type="text" value={formatToPar(stats.best_to_par, 0)} disabled={true} className="form-input" />

      <label className="form-label">Total Rounds</label>
      <input
        type="text"
        value={format(stats.total_rounds)}
        disabled={true}
        className="form-input"
      />
    </div>
  );
}
