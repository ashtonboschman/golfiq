'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { TrendingUp, Brain, UserStar, GraduationCap} from 'lucide-react';
import PremiumGate from '@/components/PremiumGate';

export default function InsightsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?redirect=/insights');
    }
  }, [status, router]);

  if (status === 'loading') {
    return <p className='loading-text'>Loading...</p>;
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="page-stack">
      <div className='card'>
        <p className="ai-coach-subtitle">
          Get personalized insights and recommendations to improve your game
        </p>
      </div>    
      <PremiumGate featureName="GolfIQ Insights">
        <></>
      </PremiumGate>
      <div className="ai-coach-content">
        <div className="coach-card">
          <h2><Brain/> Performance Analysis</h2>
          <p>
            GolfIQ analyzes your recent rounds to identify strengths and
            areas for improvement. Get detailed breakdowns of your
            performance across different aspects of the game.
          </p>
        </div>

        <div className="coach-card">
          <h2><UserStar/> Personalized Recommendations</h2>
          <p>
            Receive tailored practice suggestions based on your statistics.
            Focus on what matters most to lower your scores.
          </p>
        </div>

        <div className="coach-card">
          <h2><TrendingUp/> Trend Analysis</h2>
          <p>
            Track your progress over time and see how your game evolves.
            Identify patterns and celebrate improvements.
          </p>
        </div>

        <div className="coach-card">
          <h2><GraduationCap/> Expert Tips</h2>
          <p>
            Get contextual advice on strategy, course management, and
            mental game based on your playing style.
          </p>
        </div>

        <div className="coach-placeholder">
          <p>
            Insights features coming soon! We're working on building an
            intelligent insights system powered by machine learning.
          </p>
        </div>
      </div>
    </div>
  );
}
