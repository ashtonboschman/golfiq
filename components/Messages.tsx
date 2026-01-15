'use client';

import { useEffect, useRef } from 'react';
import { useMessage } from '@/app/providers';
import { SquareCheck, TriangleAlert } from 'lucide-react';

export default function Messages({ duration = 2000, mode = 'toast' }: { duration?: number; mode?: 'toast' | 'modal' }) {
  const { message, type, clearMessage } = useMessage();
  const lastMessageRef = useRef('');

  useEffect(() => {
    if (!message) return;

    // Update lastMessageRef to track the current message
    lastMessageRef.current = message;

    // Auto-dismiss for toast mode, or for modal mode with success messages
    if (mode === 'toast' || (mode === 'modal' && type === 'success')) {
      const timer = setTimeout(() => {
        clearMessage();
        lastMessageRef.current = '';
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [message, duration, clearMessage, mode, type]);

  if (!message) return null;

  const isError = type === 'error';

  // Modal mode - errors require manual dismiss, success auto-dismisses
  if (mode === 'modal') {
    // For error messages, show backdrop and OK button
    if (isError) {
      return (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 9998,
            }}
            onClick={clearMessage}
          />

          {/* Modal */}
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            zIndex: 9999,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                <TriangleAlert/>
              </div>
              <h3 style={{
                margin: '0 0 12px 0',
                fontSize: '20px',
                fontWeight: 600,
                color: '#dc3545',
              }}>
                Error
              </h3>
              <p style={{
                margin: '0 0 24px 0',
                fontSize: '16px',
                color: '#333',
                lineHeight: '1.5',
              }}>
                {message}
              </p>
              <button
                onClick={() => {
                  clearMessage();
                  lastMessageRef.current = '';
                }}
                style={{
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 24px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                OK
              </button>
            </div>
          </div>
        </>
      );
    }

    // For success messages, show as a toast (auto-dismiss)
    return (
      <div className="message-toast success">
        <span className="message-emoji"><SquareCheck/></span>
        <span>{message}</span>
      </div>
    );
  }

  // Toast mode (default)
  return (
    <div className={`message-toast ${isError ? 'error' : 'success'}`}>
      <span className="message-emoji">{isError ? <TriangleAlert/> : <SquareCheck/>}</span>
      <span>{message}</span>
    </div>
  );
}
