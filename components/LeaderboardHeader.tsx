interface LeaderboardHeaderProps {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (key: string) => void;
}

export default function LeaderboardHeader({ sortBy, sortOrder, onSort }: LeaderboardHeaderProps) {
  const headers = [
    { key: 'rank', label: '#' },
    { key: 'name', label: 'Name' },
    { key: 'handicap', label: 'HCP' },
    { key: 'average_score', label: 'Avg' },
    { key: 'best_score', label: 'Best' },
  ];

  const handleSort = (key: string) => {
    if (key === 'name' || key === 'rank') return;
    onSort(key);
  };

  return (
    <div className="card">
      <div className="leaderboard-row">
        {headers.map((h) => (
          <div
            key={h.key}
            className={`leaderboard-cell ${
              h.key === 'rank' || h.key === 'name' ? 'name-header' : 'sortable-header'
            } ${sortBy === h.key ? 'sorted' : ''}`}
            onClick={() => handleSort(h.key)}
          >
            {h.label}
            {sortBy === h.key && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
          </div>
        ))}
      </div>
    </div>
  );
}
