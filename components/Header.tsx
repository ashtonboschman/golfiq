'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAvatar } from '@/context/AvatarContext';
import { ChevronLeft } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';

const LOGO_BY_THEME: Record<string, string> = {
  dark: '/logos/wordmark/golfiq-wordmark.png',
  light: '/logos/wordmark/golfiq-wordmark-light.png',
  sunrise: '/logos/wordmark/golfiq-wordmark-sunrise.png',
  twilight: '/logos/wordmark/golfiq-wordmark-twilight.png',
  classic: '/logos/wordmark/golfiq-wordmark-classic.png',
  metallic: '/logos/wordmark/golfiq-wordmark-metallic.png',
  oceanic: '/logos/wordmark/golfiq-wordmark-oceanic.png',
  aurora: '/logos/wordmark/golfiq-wordmark-aurora.png',
  forest: '/logos/wordmark/golfiq-wordmark-forest.png',
  floral: '/logos/wordmark/golfiq-wordmark-floral.png',
};

export default function Header() {
  const { data: session } = useSession();
  const user = session?.user;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { avatarUrl } = useAvatar();
  const { theme } = useTheme();
  const logoSrc = LOGO_BY_THEME[theme] || '/logos/wordmark/golfiq-wordmark.png';

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check if viewing someone else's dashboard
  const isViewingOthersDashboard = pathname === '/dashboard' && searchParams.has('user_id');

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
    // Re-check sessionStorage at click time for most up-to-date value
    const hasUnsavedChanges = pathname === '/profile' && typeof window !== 'undefined' && sessionStorage.getItem('profile-has-changes') === 'true';

    if (isOnAddEditPage) {
      if (!window.confirm('Are you sure you want to leave? Any unsaved changes will be lost.')) {
        return;
      }
    } else if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        return;
      }
      sessionStorage.removeItem('profile-has-changes');
    }
    setDropdownOpen(false);
    await signOut({ redirect: false });
    router.replace('/login');
  };

  const showBackButton =
    (user && pathname !== '/dashboard') ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/about' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/contact' ||
    isViewingOthersDashboard;

  const handleBackClick = () => {
    // Re-check sessionStorage at click time for most up-to-date value
    const hasUnsavedChanges = pathname === '/profile' && typeof window !== 'undefined' && sessionStorage.getItem('profile-has-changes') === 'true';

    // On legal/info pages, always go to landing page
    if (pathname === '/about' || pathname === '/privacy' || pathname === '/terms' || pathname === '/contact') {
      router.push('/');
    }
    // On reset-password page, always go to login
    else if (pathname === '/reset-password') {
      router.push('/login');
    }
    // On round add page, warn before navigating away (same as cancel button)
    else if (pathname === '/rounds/add') {
      if (window.confirm('Are you sure you want to leave? Any unsaved changes will be lost.')) {
        const from = searchParams.get('from') || 'rounds';

        if (from.startsWith('/')) {
          // Full URL path (e.g., /courses/123)
          router.replace(from);
        } else if (from === 'dashboard') {
          router.replace('/dashboard');
        } else {
          router.replace('/rounds');
        }
      }
    }
    // On round edit page, warn before navigating away (same as cancel button)
    else if (pathname?.match(/^\/rounds\/edit\/\d+$/)) {
      if (window.confirm('Are you sure you want to leave? Any unsaved changes will be lost.')) {
        const from = searchParams.get('from') || 'stats';
        const roundId = pathname.split('/')[3];

        if (from === 'rounds') {
          router.replace('/rounds');
        } else {
          router.replace(`/rounds/${roundId}/stats`);
        }
      }
    }
    // On profile with unsaved changes, warn before navigating away
    else if (hasUnsavedChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        sessionStorage.removeItem('profile-has-changes');
        window.history.back();
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
          src={logoSrc}
          alt="GolfIQ"
          height="40"
          onClick={() => {
            if (user) {
              navigateWithWarning('/dashboard');
            } else {
              // On other pages (login, register, etc.), go to landing page
              router.push('/');
            }
          }}
          className="logo"
          title={user ? "Dashboard" : "Home"}
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
                  navigateWithWarning('/profile');
                }}
              >
                Profile
              </button>
              <button
                className="btn btn-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdownOpen(false);
                  navigateWithWarning('/settings');
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
