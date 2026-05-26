import { Sparkles } from 'lucide-react';
import OverallInsightMessage from '@/components/insights/OverallInsightMessage';
import styles from './OnboardingPreview.module.css';

const previewCards = [
  'Your recent rounds are averaging about 5 strokes better than your normal scoring range.',
  'Putting is saving strokes consistently, while missed greens are trending right.',
  'Your scoring patterns have become more stable over recent rounds.',
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
