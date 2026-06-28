'use client';
import { useEffect, useSyncExternalStore } from 'react';
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
import { clearLiveRoundRecoveryState } from '@/lib/rounds/liveRoundResume';
import {
  isLiveRoundPath,
  requestLiveRoundNavigation,
} from '@/lib/rounds/liveRoundNavigation';
import { captureClientEvent } from '@/lib/analytics/client';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

const ADD_ROUND_DIRTY_KEY = 'golfiq-add-round-dirty';

export default function Footer() {
  const { data: session, status } = useSession();
  const user = session?.user;
  const router = useRouter();
  const pathname = usePathname();
  const { incomingRequests, unreadAcceptedNotificationsCount } = useFriends();
  const { showConfirm } = useMessage();
  const hasInsightsNudge = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => undefined;
      const sync = () => onStoreChange();
      window.addEventListener(INSIGHTS_NUDGE_EVENT, sync);
      window.addEventListener('storage', sync);
      return () => {
        window.removeEventListener(INSIGHTS_NUDGE_EVENT, sync);
        window.removeEventListener('storage', sync);
      };
    },
    () => hasInsightsNudgePending(),
    () => false,
  );
  const publicRoutes = new Set([
    '/',
    '/login',
    '/onboarding',
    '/post-signup',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/about',
    '/privacy',
    '/terms',
    '/contact',
    '/verify-email',
  ]);
  const isPublicRoute = publicRoutes.has(pathname);
  const showPersistentShell = status === 'loading' && !isPublicRoute;
  const isInteractive = status === 'authenticated' && !!user;

  // Check if on add/edit round pages
  const isOnAddRoundPage = pathname === '/rounds/add';
  const isOnEditRoundPage = Boolean(pathname?.match(/^\/rounds\/edit\/\d+$/));
  const isOnLiveRoundPage = isLiveRoundPath(pathname);

  // Helper to navigate with warning if on add/edit page or profile with changes
  const navigateWithWarning = (path: string) => {
    // Re-check sessionStorage at click time for most up-to-date value
    const hasUnsavedChanges = pathname === '/profile' && typeof window !== 'undefined' && sessionStorage.getItem('profile-has-changes') === 'true';

    const addRoundHasUnsavedChanges =
      isOnAddRoundPage &&
      typeof window !== 'undefined' &&
      sessionStorage.getItem(ADD_ROUND_DIRTY_KEY) === 'true';

    if (isOnLiveRoundPage && requestLiveRoundNavigation({ path })) {
      return;
    }

    if (addRoundHasUnsavedChanges) {
      showConfirm({
        title: 'Discard changes?',
        message: 'You have unsaved round details.',
        cancelText: 'Stay',
        confirmText: 'Discard',
        variant: 'warning',
        confirmVariant: 'danger',
        onConfirm: () => {
          clearLiveRoundRecoveryState(user?.id);
          sessionStorage.removeItem(ADD_ROUND_DIRTY_KEY);
          router.push(path);
        },
      });
    } else if (isOnEditRoundPage || hasUnsavedChanges) {
      showConfirm({
        message: isOnEditRoundPage
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
    { path: '/dashboard', icon: <LayoutDashboard/>, label: 'Dashboard' },
    { path: '/rounds', icon: <LandPlot/>, label: 'Rounds' },
    { path: '/courses', icon: <MapPin/>, label: 'Courses' },
    { path: '/insights', icon: <TrendingUp/>, label: 'Insights' },
    { path: '/friends', icon: <Users2/>, label: 'Friends' },
    { path: '/leaderboard', icon: <Trophy/>, label: 'Leaderboard' },
  ];

  const isButtonActive = (path: string) => {
    if (path === '/dashboard') return pathname === '/dashboard' || pathname === '/';
    if (path === '/friends' && pathname.startsWith('/users/')) return true;
    return pathname.startsWith(path);
  };

  const trackInsightsTabClick = () => {
    captureClientEvent(
      ANALYTICS_EVENTS.insightsTabClicked,
      {
        surface: 'footer_nav',
        source_page: pathname,
      },
      {
        pathname,
        user: {
          id: session?.user?.id,
          subscription_tier: session?.user?.subscription_tier,
          auth_provider: session?.user?.auth_provider,
        },
        isLoggedIn: status === 'authenticated',
      },
    );
  };

  const unreadFriendActivityCount = incomingRequests.length + unreadAcceptedNotificationsCount;
  const hasUnreadFriendActivity = isInteractive && unreadFriendActivityCount > 0;
  const showInsightsBadge = hasInsightsNudge && !pathname.startsWith('/insights');

  useEffect(() => {
    if (pathname.startsWith('/insights')) {
      clearInsightsNudgePending();
    }
  }, [pathname]);

  if (pathname === '/post-signup') return null;
  if (!isInteractive && !showPersistentShell) return null;

  return (
    <footer className="footer-menu">
      <div className="footer-menu-inner">
        {buttons.map(({ path, icon, label }) => (
          <button
            key={path}
            className={isButtonActive(path) ? 'active' : ''}
            onClick={() => {
              if (!isInteractive) return;
              if (path === '/insights') {
                trackInsightsTabClick();
              }
              navigateWithWarning(path);
            }}
            disabled={!isInteractive}
          >
            <span className="icon footer-icon">
              {icon}
              {path === '/friends' && hasUnreadFriendActivity && (
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
