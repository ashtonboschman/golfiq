'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { useMessage } from '@/app/providers';
import { useSubscription } from '@/hooks/useSubscription';
import Link from 'next/link';
import { Check, Edit, X, Trash2, Crown } from 'lucide-react';
import { Confidence } from '@prisma/client';
import RoundInsights from '@/components/RoundInsights';

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
  number_of_holes: number;
  total_score: number;
  total_par: number;
  score_to_par: number;
  score_to_par_formatted: string;
  handicap_at_round: number | null;
  greens_in_regulation: number | null;
  gir_percentage: string | null;
  total_holes_for_gir: number;
  fairways_hit: number | null;
  fir_percentage: string | null;
  total_holes_for_fir: number;
  total_putts: number | null;
  putts_per_hole: string | null;
  total_penalties: number | null;
  scoring_by_par: ScoringByPar[];
  hole_details: HoleDetail[];
  notes: string | null;
  hole_by_hole: boolean;
  advanced_stats: boolean;
  sg_total: number;
  sg_off_tee: number | null;
  sg_approach: number | null;
  sg_putting: number | null;
  sg_penalties: number | null;
  sg_residual: number | null;
  confidence: Confidence;
  message: string;
}

export default function RoundStatsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const { showMessage, clearMessage, showConfirm } = useMessage();

  const [stats, setStats] = useState<RoundStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showStrokesGained, setShowStrokesGained] = useState(false);
  const { isPremium } = useSubscription();

  const roundId = params?.id as string;

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  // Fetch user preference for showing strokes gained
  useEffect(() => {
    const fetchPreference = async () => {
      try {
        const res = await fetch('/api/users/profile');
        if (res.ok) {
          const data = await res.json();
          setShowStrokesGained(data.profile?.showStrokesGained ?? false);
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      }
    };

    if (status === 'authenticated') {
      fetchPreference();
    }
  }, [status]);

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

  const handleDelete = async () => {
    showConfirm({
      message: 'Are you sure you want to delete this round?',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/rounds/${roundId}`, {
            method: 'DELETE',
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.message || 'Error deleting round');
          }

          showMessage('Round deleted successfully', 'success');
          router.replace('/rounds');
        } catch (error: any) {
          console.error('Error deleting round:', error);
          showMessage(error.message || 'Failed to delete round', 'error');
        }
      }
    });
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
          <div className='stats-header-container'>
            <h1 className="stats-header-title">
              {stats.course_name}
            </h1>
            <p className="stats-header-subtitle">
              {formatDate(stats.date)}
            </p>
            <div className='stats-holes-tees-container'>
              <p className="round-holes-tag">
                {stats.number_of_holes} Holes
              </p>
              <p className={`tee-tag stats-tee-tag tee-${stats.tee_name.toLowerCase()}`}>
                {stats.tee_name}
              </p>
            </div>
          </div>          
          <div style={{ display: 'flex', gap: '10px' }}>
            <Link
              href={`/rounds/edit/${roundId}?from=stats`}
              className="btn btn-edit"
            >
              <Edit/>
            </Link>
            <button
              onClick={handleDelete}
              className="btn btn-cancel"
            >
              <Trash2/>
            </button>
          </div>
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
              <div className={`stats-score-value ${stats.fir_percentage != null ? parseFloat(stats.fir_percentage) >= 60 ? 'green' : parseFloat(stats.fir_percentage) < 30 ? 'red' : 'primary' : 'primary'}`}>
                {stats.fir_percentage !== null ? `${stats.fir_percentage}%` : '-'}
              </div>
              <div className="stats-score-label">
                FIR {stats.fairways_hit !== null ? `(${stats.fairways_hit}/${stats.total_holes_for_fir})` : ''}
              </div>
            </div>
            <div>
              <div className={`stats-score-value ${stats.gir_percentage != null ? parseFloat(stats.gir_percentage) >= 60 ? 'green' : parseFloat(stats.gir_percentage) < 30 ? 'red' : 'primary' : 'primary'}`}>
                {stats.gir_percentage !== null ? `${stats.gir_percentage}%` : '-'}
              </div>
              <div className="stats-score-label">
                GIR {stats.greens_in_regulation !== null ? `(${stats.greens_in_regulation}/${stats.total_holes_for_gir})` : ''}
              </div>
            </div>
            <div>
              <div className={`stats-score-value ${stats.putts_per_hole != null ? parseFloat(stats.putts_per_hole) < 1.8 ? 'green' : parseFloat(stats.putts_per_hole) >= 2.2 ? 'red' : 'primary' : 'primary'}`}>
                {stats.putts_per_hole ?? '-'}
              </div>
              <div className="stats-score-label">
                Putts/Hole {stats.total_putts !== null ? `(${stats.total_putts} total)` : ''}
              </div>
            </div>
            <div>
              <div className={`stats-score-value ${stats.total_penalties != null ? stats.total_penalties < 1 ? 'green' : stats.total_penalties >= 3 ? 'red' : 'primary' : 'primary'}`}>
                {stats.total_penalties ?? '-'}
              </div>
              <div className="stats-score-label">
                Penalties
              </div>
            </div>
          </div>
        </div>

        {/* AI Performance Insights */}
        <RoundInsights roundId={roundId} isPremium={isPremium} />

        {/* Strokes Gained Summary Card */}
        {isPremium && showStrokesGained && (
          <div className="stats-score-summary">
            <div className="stats-score-grid">
                {stats.handicap_at_round !== null && (
                  <>
                    <div>
                      <div className={`stats-score-value ${stats.sg_total != null ? stats.sg_total > 1 ? 'green' : stats.sg_total < -1 ? 'red' : 'primary' : 'primary'}`}>
                        {stats.sg_total != null ? `${stats.sg_total > 0 ? '+' : ''}${stats.sg_total}` : '-'}
                      </div>
                      <div className="stats-score-label">
                        SG Total
                      </div>
                    </div>
                    <div>
                      <div className={`stats-score-value ${stats.sg_off_tee != null ? stats.sg_off_tee > 1 ? 'green' : stats.sg_off_tee < -1 ? 'red' : 'primary' : 'primary'}`}>
                        {stats.sg_off_tee != null ? `${stats.sg_off_tee > 0 ? '+' : ''}${stats.sg_off_tee}` : '-'}
                      </div>
                      <div className="stats-score-label">
                        SG Off Tee
                      </div>
                    </div>
                    <div>
                      <div className={`stats-score-value ${stats.sg_approach != null ? stats.sg_approach > 1 ? 'green' : stats.sg_approach < -1 ? 'red' : 'primary' : 'primary'}`}>
                        {stats.sg_approach != null ? `${stats.sg_approach > 0 ? '+' : ''}${stats.sg_approach}` : '-'}
                      </div>
                      <div className="stats-score-label">
                        SG Approach
                      </div>
                    </div>
                    <div>
                      <div className={`stats-score-value ${stats.sg_putting != null ? stats.sg_putting > 1 ? 'green' : stats.sg_putting < -1 ? 'red' : 'primary' : 'primary'}`}>
                        {stats.sg_putting != null ? `${stats.sg_putting > 0 ? '+' : ''}${stats.sg_putting}` : '-'}
                      </div>
                      <div className="stats-score-label">
                        SG Putting
                      </div>
                    </div>
                    <div>
                      <div className={`stats-score-value ${stats.sg_penalties != null ? stats.sg_penalties > 1 ? 'green' : stats.sg_penalties < -1 ? 'red' : 'primary' : 'primary'}`}>
                        {stats.sg_penalties != null ? `${stats.sg_penalties > 0 ? '+' : ''}${stats.sg_penalties}` : '-'}
                      </div>
                      <div className="stats-score-label">
                        SG Penalties
                      </div>
                    </div>
                    <div>
                      <div className={`stats-score-value ${stats.sg_residual != null ? stats.sg_residual > 1 ? 'green' : stats.sg_residual < -1 ? 'red' : 'primary' : 'primary'}`}>
                        {stats.sg_residual != null ? `${stats.sg_residual > 0 ? '+' : ''}${stats.sg_residual}` : '-'}
                      </div>
                      <div className="stats-score-label">
                        SG Residual
                      </div>
                    </div>
                  </>
                )}
            </div>
            {/* Handicap required message for strokes gained */}
            {stats.handicap_at_round === null && (
              <div className="info-banner warning">
                <div className="info-banner-content">
                  <div className="info-banner-icon"><Crown size={45}/></div>
                  <div className="info-banner-text">
                    <h4>Handicap Required for Strokes Gained</h4>
                    <p>
                      To see strokes gained statistics, you need to establish a handicap by logging at least 3 rounds. Keep playing and your handicap will be calculated automatically.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

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
                      {item.score_to_par > 0 ? `+${item.score_to_par}` : item.score_to_par < 0 ? item.score_to_par : 'E'}
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
        <div className="form">
          <button
            onClick={() => router.push('/rounds')}
            className="btn btn-add"
          >
            Back to Rounds
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="btn btn-add"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
