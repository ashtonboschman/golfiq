'use client';

import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useAvatar } from '@/context/AvatarContext';
import { ChevronLeft } from 'lucide-react';

export default function Header() {
  const { data: session } = useSession();
  const user = session?.user;
  const router = useRouter();
  const pathname = usePathname();
  const { avatarUrl } = useAvatar();

  // Show back button on authenticated pages (except dashboard/root) and auth pages
  const showBackButton =
    (user && pathname !== '/' && pathname !== '/dashboard') ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password';

  const handleBackClick = () => {
    // On reset-password page, always go to login
    if (pathname === '/reset-password') {
      router.push('/login');
    }
    // On round stats page, always go to rounds list
    else if (pathname?.match(/^\/rounds\/\d+\/stats$/)) {
      router.push('/rounds');
    }
    // On round edit page, go to stats page
    else if (pathname?.match(/^\/rounds\/edit\/\d+$/)) {
      const roundId = pathname.split('/')[3];
      router.push(`/rounds/${roundId}/stats`);
    }
    else {
      window.history.back();
    }
  };

  return (
    <header className="header">
      <div className="header-inner">
        {showBackButton ? (
          <button
            className="left-button"
            onClick={handleBackClick}
            title="Go Back"
          >
            <ChevronLeft />
          </button>
        ) : (
          <div style={{ width: '40px' }} /> // Spacer to keep logo centered
        )}

        
        <img
          src={'/logos/wordmark/golfiq-wordmark.png'}
          alt="GolfIQ"
          height="40"
          onClick={() => {if (user) router.push('/');}}
          className="logo"
          title="Home Page"
        />

        {user && (
          <img
            src={avatarUrl || '/avatars/default.png'}
            alt="User Avatar"
            onClick={() => router.push('/profile')}
            className="right-button"
            title="View Profile"
          />
        )}
      </div>
    </header>
  );
}
