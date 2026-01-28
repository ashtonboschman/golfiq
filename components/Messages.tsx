'use client';

import { useEffect, useRef } from 'react';
import { useMessage } from '@/app/providers';
import { SquareCheck, TriangleAlert } from 'lucide-react';

export default function Messages({ duration = 2000, mode = 'toast' }: { duration?: number; mode?: 'toast' | 'modal' }) {
  const { message, type, clearMessage, confirmDialog, clearConfirm } = useMessage();
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

  // Render confirm dialog if present
  if (confirmDialog) {
    return (
      <>
        <div
          className="modal-backdrop"
          onClick={() => {
            confirmDialog.onCancel?.();
            clearConfirm();
          }}
        />

        <div className="modal-container">
          <div className="modal-content">
            <div className="modal-icon warning">
              <TriangleAlert size={50}/>
            </div>
            <h3 className="modal-title">Confirm Action</h3>
            <p className="modal-message">{confirmDialog.message}</p>
            <div className="modal-buttons">
              <button
                onClick={() => {
                  confirmDialog.onCancel?.();
                  clearConfirm();
                }}
                className="btn btn-cancel"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm();
                  clearConfirm();
                }}
                className="btn btn-save"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!message) return null;

  const isError = type === 'error';

  // Modal mode - errors require manual dismiss, success auto-dismisses
  if (mode === 'modal') {
    // For error messages, show backdrop and OK button
    if (isError) {
      return (
        <>
          <div className="modal-backdrop" onClick={clearMessage} />

          <div className="modal-container">
            <div className="modal-content">
              <div className="modal-icon error">
                <TriangleAlert size={50}/>
              </div>
              <h3 className="modal-title">Error</h3>
              <p className="modal-message">{message}</p>
              <button
                onClick={() => {
                  clearMessage();
                  lastMessageRef.current = '';
                }}
                className="btn btn-save btn-single"
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
}
