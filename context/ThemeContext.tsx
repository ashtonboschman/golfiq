'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { clearProfileCache, fetchProfileCached } from '@/lib/client/profileCache';

interface ThemeContextType {
  theme: string;
  setTheme: (theme: string) => Promise<void>;
  availableThemes: { value: string; label: string; premiumOnly: boolean }[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const THEME_STORAGE_KEY = 'golfiq:theme';
const THEME_AUTH_KEY = 'golfiq:auth';
const THEME_UPDATED_AT_KEY = 'golfiq:themeUpdatedAt';

const AVAILABLE_THEMES = [
  { value: 'dark', label: 'Dark', premiumOnly: false },
  { value: 'light', label: 'Light', premiumOnly: false },
  { value: 'sunrise', label: 'Sunrise', premiumOnly: true },
  { value: 'twilight', label: 'Twilight', premiumOnly: true },
  { value: 'classic', label: 'Classic', premiumOnly: true },
  { value: 'metallic', label: 'Metallic', premiumOnly: true },
  { value: 'oceanic', label: 'Oceanic', premiumOnly: true },
  { value: 'aurora', label: 'Aurora', premiumOnly: true },
  { value: 'forest', label: 'Forest', premiumOnly: true },
  { value: 'floral', label: 'Floral', premiumOnly: true },
];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ? String(session.user.id) : null;
  const sessionTheme = session?.user?.theme ?? null;
  const [theme, setThemeState] = useState<string>('dark');
  const bootstrappedRef = useRef(false);
  const previousUserIdRef = useRef<string | null>(null);

  const readStoredTheme = () => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      return null;
    }
  };

  const readThemeUpdatedAt = () => {
    try {
      const raw = localStorage.getItem(THEME_UPDATED_AT_KEY);
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const writeStoredTheme = (newTheme: string, trackAsLocalUpdate = false) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      if (trackAsLocalUpdate) {
        localStorage.setItem(THEME_UPDATED_AT_KEY, String(Date.now()));
      }
    } catch {
      // noop
    }
  };

  const readAuthMarker = () => {
    try {
      return localStorage.getItem(THEME_AUTH_KEY) === '1';
    } catch {
      return false;
    }
  };

  const writeAuthMarker = (isAuthed: boolean) => {
    try {
      if (isAuthed) localStorage.setItem(THEME_AUTH_KEY, '1');
      else localStorage.removeItem(THEME_AUTH_KEY);
    } catch {
      // noop
    }
  };

  useEffect(() => {
    const applyTheme = (newTheme: string) => {
      setThemeState(newTheme);
      document.documentElement.className = document.documentElement.className
        .split(' ')
        .filter(cls => !cls.startsWith('theme-'))
        .concat(`theme-${newTheme}`)
        .join(' ');
    };

    const shouldUseStoredThemeOnBoot = () => {
      const pathname = window.location.pathname;
      const publicDarkRoutes = new Set([
        '/',
        '/login',
        '/register',
        '/forgot-password',
        '/reset-password',
        '/about',
        '/privacy',
        '/terms',
        '/contact',
      ]);
      if (publicDarkRoutes.has(pathname)) return false;
      return readAuthMarker();
    };

    if (!bootstrappedRef.current) {
      if (shouldUseStoredThemeOnBoot()) {
        const storedTheme = readStoredTheme();
        if (storedTheme) {
          applyTheme(storedTheme);
        }
      } else {
        applyTheme('dark');
      }
      bootstrappedRef.current = true;
    }

    if (status === 'loading') return;

    if (status === 'authenticated' && userId) {
      writeAuthMarker(true);
      const userChanged = previousUserIdRef.current !== userId;
      previousUserIdRef.current = userId;
      const storedTheme = readStoredTheme();
      if (storedTheme) {
        applyTheme(storedTheme);
      } else if (sessionTheme) {
        applyTheme(sessionTheme);
        writeStoredTheme(sessionTheme);
      } else if (userChanged) {
        const fallbackStoredTheme = readStoredTheme();
        if (fallbackStoredTheme) applyTheme(fallbackStoredTheme);
      }

      // Fetch from the new merged API
      const loadUserTheme = async () => {
        try {
          const data = await fetchProfileCached(userId, true);
          const userTheme = data?.profile?.theme || 'dark';
          const currentStoredTheme = readStoredTheme();
          if (currentStoredTheme && currentStoredTheme !== userTheme) {
            const lastLocalUpdate = readThemeUpdatedAt();
            const wasRecentlyChangedLocally =
              lastLocalUpdate != null && Date.now() - lastLocalUpdate < 120_000;
            if (wasRecentlyChangedLocally) {
              return;
            }
          }
          applyTheme(userTheme);
          writeStoredTheme(userTheme);
        } catch (error) {
          console.error('Failed to load theme preference:', error);
        }
      };
      loadUserTheme();
    } else if (status === 'unauthenticated') {
      previousUserIdRef.current = null;
      writeAuthMarker(false);
      applyTheme('dark');
    }
  }, [status, userId, sessionTheme]);

  const setTheme = async (newTheme: string) => {
    setThemeState(newTheme);
    writeStoredTheme(newTheme, true);
    if (status === 'authenticated') {
      writeAuthMarker(true);
    }

    document.documentElement.className = document.documentElement.className
      .split(' ')
      .filter(cls => !cls.startsWith('theme-'))
      .concat(`theme-${newTheme}`)
      .join(' ');

    if (status === 'authenticated') {
      // Save to database for authenticated users
      try {
        await fetch('/api/theme', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme: newTheme }),
        });
        if (userId) {
          clearProfileCache(userId);
        }
      } catch (error) {
        console.error('Failed to save theme preference:', error);
      }
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, availableThemes: AVAILABLE_THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
