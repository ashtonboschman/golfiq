'use client';
import { useFriends } from '../context/FriendsContext';
import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { LayoutDashboard, LandPlot, MapPin, TrendingUp, Users2, Trophy } from 'lucide-react'

export default function Footer() {
  const { data: session } = useSession();
  const user = session?.user;
  const router = useRouter();
  const pathname = usePathname();

  if (!user) return null;

  // Check if on add/edit round pages
  const isOnAddEditPage = pathname === '/rounds/add' || pathname?.match(/^\/rounds\/edit\/\d+$/);

  // Helper to navigate with warning if on add/edit page or profile with changes
  const navigateWithWarning = (path: string) => {
    // Re-check sessionStorage at click time for most up-to-date value
    const hasUnsavedChanges = pathname === '/profile' && typeof window !== 'undefined' && sessionStorage.getItem('profile-has-changes') === 'true';

    if (isOnAddEditPage) {
      if (window.confirm('Are you sure you want to leave? Any unsaved changes will be lost.')) {
        router.push(path);
      }
    } else if (hasUnsavedChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        sessionStorage.removeItem('profile-has-changes');
        router.push(path);
      }
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

  const { incomingRequests } = useFriends();
  const hasIncomingRequests = incomingRequests.length > 0;

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
            </span>
            <span className="label">{label}</span>
          </button>
        ))}
      </div>
    </footer>
  );
}
