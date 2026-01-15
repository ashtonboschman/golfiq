'use client';

import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { LayoutDashboard, LandPlot, MapPin, TrendingUp, Users2, Trophy } from 'lucide-react'

export default function Footer() {
  const { data: session } = useSession();
  const user = session?.user;
  const router = useRouter();
  const pathname = usePathname();

  if (!user) return null;

  const buttons = [
    { path: '/', emoji: <LayoutDashboard/>, label: 'Dashboard' },
    { path: '/rounds', emoji: <LandPlot/>, label: 'Rounds' },
    { path: '/courses', emoji: <MapPin/>, label: 'Courses' },
    { path: '/insights', emoji: <TrendingUp/>, label: 'Insights' },
    { path: '/friends', emoji: <Users2/>, label: 'Friends' },
    { path: '/leaderboard', emoji: <Trophy/>, label: 'Leaderboard' },
  ];

  const isButtonActive = (path: string) => {
    if (path === '/') return pathname === '/' || pathname === '/dashboard';
    if (path === '/friends' && pathname.startsWith('/users/')) return true;
    return pathname.startsWith(path);
  };

  return (
    <footer className="footer-menu">
      <div className="footer-menu-inner">
        {buttons.map(({ path, emoji, label }) => (
          <button
            key={path}
            className={isButtonActive(path) ? 'active' : ''}
            onClick={() => router.push(path)}
          >
            <span className="emoji">{emoji}</span>
            <span className="label">{label}</span>
          </button>
        ))}
      </div>
    </footer>
  );
}
