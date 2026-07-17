import TrendCard from '@/components/TrendCard';
import styles from './OnboardingPreview.module.css';

const scoreTrendData = {
  labels: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'],
  datasets: [
    {
      label: 'Total Score',
      data: [93, 91, 89, 87, 85, 84, 81, 79],
      borderColor: '#2D6CFF',
      backgroundColor: 'rgba(0,0,0,0)',
      tension: 0.3,
      pointRadius: 5,
      pointBackgroundColor: '#2D6CFF',
      pointHoverRadius: 7,
      spanGaps: true,
    },
  ],
};

export default function OnboardingTrendPreview() {
  return (
    <div className={styles.previewTrendRoot} aria-hidden="true">
      <div className={styles.trendScrollViewport} data-onboarding-trend-scroll>
        <TrendCard
          trendData={scoreTrendData}
          accentColor="#2D6CFF"
          surfaceColor="#171C26"
          textColor="#EDEFF2"
          gridColor="#2A313D"
          height={260}
          label="Score History"
        />
      </div>
    </div>
  );
}
