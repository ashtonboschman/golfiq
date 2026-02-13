'use client';
import { useEffect, useState } from 'react';
import { useFriends } from '../context/FriendsContext';
import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { LayoutDashboard, LandPlot, MapPin, TrendingUp, Users2, Trophy } from 'lucide-react';
import { useMessage } from '@/app/providers';
import {
  INSIGHTS_NUDGE_EVENT,
  clearInsightsNudgePending,
  hasInsightsNudgePending,
} from '@/lib/insights/insightsNudge';

export default function Footer() {
  const { data: session } = useSession();
  const user = session?.user;
  const router = useRouter();
  const pathname = usePathname();
  const { incomingRequests } = useFriends();
  const { showConfirm } = useMessage();
  const [hasInsightsNudge, setHasInsightsNudge] = useState(false);

  if (!user) return null;

  // Check if on add/edit round pages
  const isOnAddEditPage = pathname === '/rounds/add' || pathname?.match(/^\/rounds\/edit\/\d+$/);

  // Helper to navigate with warning if on add/edit page or profile with changes
  const navigateWithWarning = (path: string) => {
    // Re-check sessionStorage at click time for most up-to-date value
    const hasUnsavedChanges = pathname === '/profile' && typeof window !== 'undefined' && sessionStorage.getItem('profile-has-changes') === 'true';

    if (isOnAddEditPage || hasUnsavedChanges) {
      showConfirm({
        message: isOnAddEditPage
          ? 'Are you sure you want to leave? Any unsaved changes will be lost.'
          : 'You have unsaved changes. Are you sure you want to leave?',
        onConfirm: () => {
          if (hasUnsavedChanges) {
            sessionStorage.removeItem('profile-has-changes');
          }
          router.push(path);
        }
      });
    } else {
      router.push(path);
    }
  };

  const buttons = [
    { path: '/', icon: <LayoutDashboard/>, label: 'Dashboard' },
    { path: '/rounds', icon: <LandPlot/>, label: 'Rounds' },
    { path: '/courses', icon: <MapPin/>, label: 'Courses' },
    { path: '/insights', icon: <TrendingUp/>, label: 'Insights' },
    { path: '/friends', icon: <Users2/>, label: 'Friends' },
    { path: '/leaderboard', icon: <Trophy/>, label: 'Leaderboard' },
  ];

  const isButtonActive = (path: string) => {
    if (path === '/') return pathname === '/' || pathname === '/dashboard';
    if (path === '/friends' && pathname.startsWith('/users/')) return true;
    return pathname.startsWith(path);
  };

  const hasIncomingRequests = incomingRequests.length > 0;
  const showInsightsBadge = hasInsightsNudge && !pathname.startsWith('/insights');

  useEffect(() => {
    setHasInsightsNudge(hasInsightsNudgePending());

    const sync = () => setHasInsightsNudge(hasInsightsNudgePending());
    window.addEventListener(INSIGHTS_NUDGE_EVENT, sync);
    window.addEventListener('storage', sync);

    return () => {
      window.removeEventListener(INSIGHTS_NUDGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    if (pathname.startsWith('/insights')) {
      clearInsightsNudgePending();
      setHasInsightsNudge(false);
    }
  }, [pathname]);

  return (
    <footer className="footer-menu">
      <div className="footer-menu-inner">
        {buttons.map(({ path, icon, label }) => (
          <button
            key={path}
            className={isButtonActive(path) ? 'active' : ''}
            onClick={() => navigateWithWarning(path)}
          >
            <span className="icon relative">
              {icon}
              {path === '/friends' && hasIncomingRequests && (
                <span className="friend-badge" />
              )}
              {path === '/insights' && showInsightsBadge && (
                <span className="friend-badge" />
              )}
            </span>
            <span className="label">{label}</span>
          </button>
        ))}
      </div>
    </footer>
  );
}
