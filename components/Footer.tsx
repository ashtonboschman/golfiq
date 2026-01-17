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

  return (
    <footer className="footer-menu">
      <div className="footer-menu-inner">
        {buttons.map(({ path, icon, label }) => (
          <button
            key={path}
            className={isButtonActive(path) ? 'active' : ''}
            onClick={() => router.push(path)}
          >
            <span className="icon">{icon}</span>
            <span className="label">{label}</span>
          </button>
        ))}
      </div>
    </footer>
  );
}
