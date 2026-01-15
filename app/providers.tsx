'use client';

import { SessionProvider } from 'next-auth/react';
import { createContext, useState, useContext, useCallback, ReactNode } from 'react';
import { FriendsProvider } from '@/context/FriendsContext';
import { AvatarProvider } from '@/context/AvatarContext';
import { ThemeProvider } from '@/context/ThemeContext';

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
