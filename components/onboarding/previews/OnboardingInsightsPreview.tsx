import { BarChart3, CircleCheck, Sparkles, type LucideIcon } from 'lucide-react';
import styles from './OnboardingPreview.module.css';

const previewTrends: Array<{
  label: string;
  icon: LucideIcon;
  role: 'recent_form' | 'strength' | 'stable';
  conclusion: string;
  supporting: string;
}> = [
  {
    label: 'Recent Form',
    icon: BarChart3,
    role: 'recent_form',
    conclusion: 'Your latest 5 rounds average 84.2 compared with 88.0',
    supporting: 'across your previous 12.',
  },
  {
    label: 'Strength',
    icon: CircleCheck,
    role: 'strength',
    conclusion: 'Putting is your strongest area at +1.7 strokes gained per round',
    supporting: 'over your last 5 rounds.',
  },
  {
    label: 'Stability',
    icon: CircleCheck,
    role: 'stable',
    conclusion: 'Seven strokes separated your best and worst scores',
    supporting: 'over your last 5 rounds.',
  },
];

export default function OnboardingInsightsPreview() {
  return (
    <div className={`${styles.insightsPreviewRoot}`}>
      <div className={`card insights-card ${styles.previewSurface} ${styles.insightsScrollViewport}`} data-onboarding-insights-scroll>
        <div className="insights-header">
          <div className="insights-title">
            <Sparkles aria-hidden="true" size={20} />
            <h3>Game Trends</h3>
          </div>
          <span className="insights-confidence-pill is-high">Strong</span>
        </div>
        <div className="game-trends-sections">
          {previewTrends.map(({ label, icon: Icon, role, conclusion, supporting }) => (
            <section
              key={role}
              className="insight-message game-trends-message"
              data-conclusion-type={role}
            >
              <div className="insight-message-content game-trends-message-content">
                <Icon
                  aria-hidden="true"
                  size={18}
                  className="insight-message-icon game-trends-message-icon"
                  data-icon-role={role}
                />
                <div className="game-trends-row-heading">
                  <h4>{label}</h4>
                </div>
                <div className="game-trends-copy">
                  <p className="game-trends-conclusion">
                    <span>{conclusion}</span> <span>{supporting}</span>
                  </p>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
