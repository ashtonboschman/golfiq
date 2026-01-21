'use client';

import { SessionProvider } from 'next-auth/react';
import { createContext, useState, useContext, useCallback, ReactNode } from 'react';
import { FriendsProvider } from '@/context/FriendsContext';
import { AvatarProvider } from '@/context/AvatarContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect } from "react"
import { usePostHog } from 'posthog-js/react'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'

// Message Context (replacing MessageContext.jsx from old app)
interface MessageContextType {
  message: string;
  type: 'success' | 'error';
  showMessage: (msg: string, msgType?: 'success' | 'error') => void;
  clearMessage: () => void;
}

const MessageContext = createContext<MessageContextType | undefined>(undefined);

export function MessageProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'success' | 'error'>('success');

  const showMessage = useCallback((msg: string, msgType: 'success' | 'error' = 'success') => {
    setMessage(msg);
    setType(msgType);
  }, []);

  const clearMessage = useCallback(() => setMessage(''), []);

  return (
    <MessageContext.Provider value={{ message, type, showMessage, clearMessage }}>
      {children}
    </MessageContext.Provider>
  );
}

export function useMessage() {
  const context = useContext(MessageContext);
  if (!context) {
    throw new Error('useMessage must be used within MessageProvider');
  }
  return context;
}

// Root Providers Component
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <MessageProvider>
          <AvatarProvider>
            <FriendsProvider>{children}</FriendsProvider>
          </AvatarProvider>
        </MessageProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      person_profiles: 'identified_only', // or 'always' to create profiles for anonymous users as well
      defaults: '2025-11-30'
    })
  }, [])

  return (
    <PHProvider client={posthog}>
      {children}
    </PHProvider>
  )
}
