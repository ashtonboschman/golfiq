import { Sparkles } from 'lucide-react';
import OverallInsightMessage from '@/components/insights/OverallInsightMessage';
import styles from './OnboardingPreview.module.css';

const previewCards = [
  'Your recent scores are about 5 strokes better than your usual level.',
  'Your putting has been helping, but missed greens are leaving extra work.',
  'Your recent scores are starting to settle into a clearer pattern.',
];

export default function OnboardingInsightsPreview() {
  return (
    <div className={`${styles.insightsPreviewRoot}`}>
      <div className={`card insights-card ${styles.previewSurface} ${styles.insightsScrollViewport}`} data-onboarding-insights-scroll>
        <div className="insights-header">
          <div className="insights-title">
            <Sparkles size={20} />
            <h3>Overall Insights</h3>
          </div>
          <span className="insights-confidence-pill is-high">Strong</span>
        </div>
        <div className="insights-content">
          {previewCards.map((card, idx) => (
            <OverallInsightMessage key={`onboarding-overall-card-${idx}`} card={card} index={idx} />
          ))}
        </div>
      </div>
    </div>
  );
}
