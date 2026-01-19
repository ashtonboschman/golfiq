'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

interface ThemeContextType {
  theme: string;
  setTheme: (theme: string) => Promise<void>;
  availableThemes: { value: string; label: string; premiumOnly: boolean }[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

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
  const [theme, setThemeState] = useState<string>('dark');
  const [mounted, setMounted] = useState(false);

  // Handle authentication state changes and initial theme load
  useEffect(() => {
    if (status === 'loading') {
      // Don't do anything while session is loading
      return;
    }

    if (status === 'authenticated') {
      // User is logged in - load their theme preference from database
      const loadUserTheme = async () => {
        try {
          const res = await fetch('/api/profile');
          if (res.ok) {
            const data = await res.json();
            const userTheme = data.profile?.theme || 'dark';

            // Apply theme from database
            setThemeState(userTheme);
            document.documentElement.className = document.documentElement.className
              .split(' ')
              .filter(cls => !cls.startsWith('theme-'))
              .concat(`theme-${userTheme}`)
              .join(' ');
          }
        } catch (error) {
          console.error('Failed to load theme preference:', error);
        }
      };
      loadUserTheme();
    } else if (status === 'unauthenticated') {
      // User is not logged in - force default theme visually
      const defaultTheme = 'dark';
      setThemeState(defaultTheme);
      document.documentElement.className = document.documentElement.className
        .split(' ')
        .filter(cls => !cls.startsWith('theme-'))
        .concat(`theme-${defaultTheme}`)
        .join(' ');
    }

    // Mark as mounted after status is resolved
    if (!mounted) {
      setMounted(true);
    }
  }, [status, mounted]);

  const setTheme = async (newTheme: string) => {
    setThemeState(newTheme);

    // Remove all theme classes and add the new one
    document.documentElement.className = document.documentElement.className
      .split(' ')
      .filter(cls => !cls.startsWith('theme-'))
      .concat(`theme-${newTheme}`)
      .join(' ');

    if (status === 'authenticated') {
      // Save to database for authenticated users
      try {
        await fetch('/api/profile/theme', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme: newTheme }),
        });
      } catch (error) {
        console.error('Failed to save theme preference:', error);
      }
    }
  };

  // Prevent flash of unstyled content
  if (!mounted) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, availableThemes: AVAILABLE_THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
