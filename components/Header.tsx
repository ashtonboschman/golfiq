'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAvatar } from '@/context/AvatarContext';
import { ChevronLeft } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export default function Header() {
  const { data: session } = useSession();
  const user = session?.user;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { avatarUrl } = useAvatar();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check if viewing someone else's dashboard
  const isViewingOthersDashboard = pathname === '/dashboard' && searchParams.has('user_id');

  // Check if on add/edit round pages
  const isOnAddEditPage = pathname === '/rounds/add' || pathname?.match(/^\/rounds\/edit\/\d+$/);

  // Helper to navigate with warning if on add/edit page
  const navigateWithWarning = (path: string) => {
    if (isOnAddEditPage) {
      if (window.confirm('Are you sure you want to leave? Any unsaved changes will be lost.')) {
        router.push(path);
      }
    } else {
      router.push(path);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    if (isOnAddEditPage) {
      if (!window.confirm('Are you sure you want to leave? Any unsaved changes will be lost.')) {
        return;
      }
    }
    setDropdownOpen(false);
    await signOut({ redirect: false });
    router.replace('/login');
  };

  const showBackButton =
    (user && pathname !== '/' && pathname !== '/dashboard') ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    isViewingOthersDashboard;

  const handleBackClick = () => {
    // On reset-password page, always go to login
    if (pathname === '/reset-password') {
      router.push('/login');
    }
    // On round add page, warn before navigating away
    else if (pathname === '/rounds/add') {
      if (window.confirm('Are you sure you want to leave? Any unsaved changes will be lost.')) {
        router.push('/rounds');
      }
    }
    // On round edit page, warn before navigating away
    else if (pathname?.match(/^\/rounds\/edit\/\d+$/)) {
      if (window.confirm('Are you sure you want to leave? Any unsaved changes will be lost.')) {
        const roundId = pathname.split('/')[3];
        router.push(`/rounds/${roundId}/stats`);
      }
    }
    // When viewing someone else's dashboard, go back to their profile
    else if (isViewingOthersDashboard) {
      const userId = searchParams.get('user_id');
      if (userId) {
        router.push(`/users/${userId}`);
      } else {
        window.history.back();
      }
    }
    else {
      // Default back behavior
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
          onClick={() => {if (user) navigateWithWarning('/');}}
          className="logo"
          title="Home Page"
        />

        {user && (
        <div className="avatar-container" ref={dropdownRef}>
          <img
            src={avatarUrl || '/avatars/default.png'}
            alt="User Avatar"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="right-button"
            title="User Menu"
          />
          {dropdownOpen && (
            <div className="card avatar-dropdown">
              <button
                className="btn btn-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdownOpen(false);
                  setTimeout(() => navigateWithWarning('/profile'), 0);
                }}
              >
                Profile
              </button>
              <button
                className="btn btn-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdownOpen(false);
                  setTimeout(() => navigateWithWarning('/settings'), 0);
                }}
              >
                Settings
              </button>
              <button
                className="btn btn-logout"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLogout();
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      )}
      </div>
    </header>
  );
}
