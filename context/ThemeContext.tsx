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

  useEffect(() => {
    if (status === 'loading') return;

    const applyTheme = (newTheme: string) => {
      setThemeState(newTheme);
      document.documentElement.className = document.documentElement.className
        .split(' ')
        .filter(cls => !cls.startsWith('theme-'))
        .concat(`theme-${newTheme}`)
        .join(' ');
    };

    if (status === 'authenticated') {
      // Fetch from the new merged API
      const loadUserTheme = async () => {
        try {
          const res = await fetch('/api/users/profile');
          if (res.ok) {
            const data = await res.json();
            const userTheme = data.profile?.theme || 'dark';
            applyTheme(userTheme);
          }
        } catch (error) {
          console.error('Failed to load theme preference:', error);
        }
      };
      loadUserTheme();
    } else if (status === 'unauthenticated') {
      applyTheme('dark'); // default for unauthenticated users
    }

    if (!mounted) setMounted(true);
  }, [status, mounted]);

  const setTheme = async (newTheme: string) => {
    setThemeState(newTheme);

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
      } catch (error) {
        console.error('Failed to save theme preference:', error);
      }
    }
  };

  if (!mounted) return null;

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
