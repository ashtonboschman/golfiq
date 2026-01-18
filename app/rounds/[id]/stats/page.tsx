'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { useMessage } from '@/app/providers';
import Link from 'next/link';
import { Check, Edit, X } from 'lucide-react';

interface HoleDetail {
  hole_number: number;
  par: number;
  yardage: number;
  handicap: number | null;
  score: number;
  score_to_par: number;
  score_to_par_formatted: string;
  gir_hit: number | null;
  fir_hit: number | null;
  putts: number | null;
  penalties: number | null;
}

interface ScoringByPar {
  par: number;
  holes: number;
  total_score: number;
  total_par: number;
  average_score: string;
  score_to_par: number;
}

interface RoundStats {
  round_id: string;
  course_name: string;
  tee_name: string;
  date: string;
  total_score: number;
  total_par: number;
  score_to_par: number;
  score_to_par_formatted: string;
  greens_in_regulation: number;
  gir_percentage: string;
  total_holes_for_gir: number;
  fairways_hit: number;
  fir_percentage: string;
  total_holes_for_fir: number;
  total_putts: number;
  putts_per_hole: string;
  total_penalties: number;
  scoring_by_par: ScoringByPar[];
  hole_details: HoleDetail[];
  notes: string | null;
  hole_by_hole: boolean;
  advanced_stats: boolean;
}

export default function RoundStatsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const { showMessage, clearMessage } = useMessage();

  const [stats, setStats] = useState<RoundStats | null>(null);
  const [loading, setLoading] = useState(true);

  const roundId = params?.id as string;

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  // Fetch round statistics
  useEffect(() => {
    if (status === 'authenticated' && roundId) {
      fetchStats();
    }
  }, [status, roundId]);

  // Refetch stats when page becomes visible (e.g., returning from edit page)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && status === 'authenticated' && roundId) {
        fetchStats();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [status, roundId]);

  const fetchStats = async () => {
    clearMessage();
    setLoading(true);

    try {
      const res = await fetch(`/api/rounds/${roundId}/stats`);

      if (res.status === 401 || res.status === 403) {
        showMessage('Unauthorized access', 'error');
        router.replace('/rounds');
        return;
      }

      if (res.status === 404) {
        showMessage('Round not found', 'error');
        router.replace('/rounds');
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Error fetching round statistics');
      }

      const result = await res.json();
      setStats(result.stats);
    } catch (error) {
      console.error('Error fetching stats:', error);
      showMessage('Failed to load round statistics', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="stats-loading-container">
        <p className='loading-text'>Loading statistics...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="stats-empty-container">
        <p>No statistics available</p>
        <Link href="/rounds" className="stats-empty-link">
          Back to Rounds
        </Link>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    // Parse date string to avoid timezone conversion issues
    const datePart = dateStr.split('T')[0]; // "YYYY-MM-DD"
    const [year, month, day] = datePart.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0);

    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="page-stack">
      <div className='card'>
        <div className="stats-header">
          <div>
            <h1 className="stats-header-title">
              {stats.course_name}
            </h1>
            <p className="stats-header-subtitle">
              {formatDate(stats.date)} • {stats.tee_name} Tees
            </p>
          </div>
          <Link
            href={`/rounds/edit/${roundId}`}
            className="btn btn-edit"
          >
            <Edit/>
          </Link>
        </div>

        {/* Score Summary Card */}
        <div className="stats-score-summary">
          <div className="stats-score-grid">
            <div>
              <div className="stats-score-value">
                {stats.total_score}
              </div>
              <div className="stats-score-label">
                Total Score
              </div>
            </div>
            <div>
              <div className={`stats-score-value ${stats.score_to_par < 0 ? 'green' : stats.score_to_par < 19 ? 'primary' : 'red'}`}>
                {stats.score_to_par_formatted}
              </div>
              <div className="stats-score-label">
                vs Par {stats.total_par}
              </div>
            </div>
            <div>
              <div className={`stats-score-value ${parseFloat(stats.gir_percentage) >= 50 ? 'green' : parseFloat(stats.gir_percentage) < 20 ? 'red' : 'primary'}`}>
                {stats.gir_percentage}%
              </div>
              <div className="stats-score-label">
                GIR ({stats.greens_in_regulation}/{stats.total_holes_for_gir})
              </div>
            </div>
            <div>
              <div className={`stats-score-value ${parseFloat(stats.fir_percentage) >= 50 ? 'green' : parseFloat(stats.fir_percentage) < 20 ? 'red' : 'primary'}`}>
                {stats.fir_percentage}%
              </div>
              <div className="stats-score-label">
                FIR ({stats.fairways_hit}/{stats.total_holes_for_fir})
              </div>
            </div>
            <div>
              <div className={`stats-score-value ${parseFloat(stats.putts_per_hole) < 2 ? 'green' : parseFloat(stats.putts_per_hole) >= 3 ? 'red' : 'primary'}`}>
                {stats.putts_per_hole}
              </div>
              <div className="stats-score-label">
                Putts/Hole ({stats.total_putts} total)
              </div>
            </div>
            <div>
              <div className={`stats-score-value ${stats.total_penalties < 1 ? 'green' : stats.total_penalties >= 3 ? 'red' : 'primary'}`}>
                {stats.total_penalties}
              </div>
              <div className="stats-score-label">
                Penalties
              </div>
            </div>
          </div>
        </div>

        {/* Scoring by Par */}
        {stats.scoring_by_par.length > 0 && (
          <div className="stats-section">
            <h3 className="stats-section-title">
              Scoring by Par
            </h3>
            <div className="stats-par-grid">
              {stats.scoring_by_par.map((item) => (
                <div key={item.par} className="stats-par-card">
                  <div className="stats-par-card-title">
                    Par {item.par}s ({item.holes} holes)
                  </div>
                  <div className="stats-par-row">
                    <span className="stats-par-label">Average</span>
                    <span className="stats-par-value">{item.average_score}</span>
                  </div>
                  <div className="stats-par-row">
                    <span className="stats-par-label">Total Strokes</span>
                    <span className="stats-par-value">{item.total_score}</span>
                  </div>
                  <div className="stats-par-row">
                    <span className="stats-par-label">vs Par</span>
                    <span className={`stats-par-value ${item.score_to_par > 0 ? 'over-par' : item.score_to_par < 0 ? 'under-par' : ''}`}>
                      {item.score_to_par > 0 ? '+' : ''}{item.score_to_par}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hole-by-Hole Details */}
        {stats.hole_by_hole && stats.hole_details.length > 0 && (
          <div className="stats-section">
            <h3 className="stats-section-title">
              Hole-by-Hole Scorecard
            </h3>
            <div className="stats-table-wrapper">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Par | Yrd</th>
                    <th>Score</th>
                    <th>+/-</th>
                    {stats.advanced_stats && (
                      <>
                        <th>F | G</th>
                        <th>Putts</th>
                        <th>Pen</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {stats.hole_details.map((hole) => (
                    <tr key={hole.hole_number}>
                      <td className="hole-number">
                        {hole.hole_number}
                      </td>
                      <td>{hole.par} | {hole.yardage}</td>
                      <td className="score">
                        {hole.score}
                      </td>
                      <td className={`score-to-par ${hole.score_to_par > 0 ? 'over-par' : hole.score_to_par < 0 ? 'under-par' : ''}`}>
                        {hole.score_to_par_formatted}
                      </td>
                      {stats.advanced_stats && (
                        <>
                          <td className="fg-cell">
                            <span className="fg-left">
                              {hole.fir_hit !== null
                                ? hole.fir_hit === 1
                                  ? <Check size={16} color="#2bb673" />
                                  : <X size={16} color="#e74c3c" />
                                : '-'}
                            </span>

                            <span className="fg-separator">|</span>

                            <span className="fg-right">
                              {hole.gir_hit !== null
                                ? hole.gir_hit === 1
                                  ? <Check size={16} color="#2bb673" />
                                  : <X size={16} color="#e74c3c" />
                                : '-'}
                            </span>
                          </td>
                          <td>
                            {hole.putts ?? '-'}
                          </td>
                          <td>
                            {hole.penalties ?? '-'}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Notes */}
        {stats.notes && (
          <div className="stats-section">
            <h3 className="stats-section-title">
              Notes
            </h3>
            <div className="stats-notes-card">
              {stats.notes}
            </div>
          </div>
        )}

        {/* Navigation Button */}
        <div className="form-actions">
          <button
            onClick={() => router.push('/')}
            className="btn btn-add"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
