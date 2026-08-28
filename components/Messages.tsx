'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import { useMessage } from '@/app/providers';
import { CircleAlert, CircleHelp, SquareCheck, TriangleAlert } from 'lucide-react';
import { useModalAccessibility } from '@/lib/ui/useModalAccessibility';

export default function Messages({ duration = 2000, mode = 'toast' }: { duration?: number; mode?: 'toast' | 'modal' }) {
  const { message, type, clearMessage, confirmDialog, clearConfirm } = useMessage();
  const lastMessageRef = useRef('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  const isErrorModal = Boolean(message && mode === 'modal' && type === 'error');

  const dismissDialog = useCallback(() => {
    if (confirmDialog) {
      confirmDialog.onCancel?.();
      clearConfirm();
      return;
    }

    clearMessage();
    lastMessageRef.current = '';
  }, [clearConfirm, clearMessage, confirmDialog]);

  useModalAccessibility({
    isOpen: Boolean(confirmDialog) || isErrorModal,
    dialogRef,
    initialFocusRef,
    onDismiss: dismissDialog,
  });

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
    const modalVariant = confirmDialog.variant || 'warning';
    const confirmButtonClass = confirmDialog.confirmVariant === 'danger'
      ? 'btn-cancel'
      : confirmDialog.confirmVariant === 'neutral'
        ? 'btn-secondary'
        : 'btn-save';

    return (
      <>
        <div
          className="modal-backdrop"
          aria-hidden="true"
          onClick={() => {
            confirmDialog.onCancel?.();
            clearConfirm();
          }}
        />

        <div
          ref={dialogRef}
          className="modal-container"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={messageId}
          tabIndex={-1}
        >
          <div className="modal-content">
            <div className={`modal-icon ${modalVariant}`}>
              {modalVariant === 'neutral' ? (
                <CircleHelp size={34} />
              ) : modalVariant === 'danger' ? (
                <TriangleAlert size={34} />
              ) : (
                <CircleAlert size={34} />
              )}
            </div>
            <h3 id={titleId} className="modal-title">{confirmDialog.title || 'Are you sure?'}</h3>
            <p id={messageId} className="modal-message">{confirmDialog.message}</p>
            <div className="modal-buttons">
              <button
                ref={initialFocusRef}
                onClick={() => {
                  confirmDialog.onCancel?.();
                  clearConfirm();
                }}
                className="btn btn-secondary"
              >
                {confirmDialog.cancelText || 'Cancel'}
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm();
                  clearConfirm();
                }}
                className={`btn ${confirmButtonClass}`}
              >
                {confirmDialog.confirmText || 'Continue'}
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
          <div className="modal-backdrop" aria-hidden="true" onClick={clearMessage} />

          <div
            ref={dialogRef}
            className="modal-container"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            tabIndex={-1}
          >
            <div className="modal-content">
              <div className="modal-icon error">
                <TriangleAlert size={50}/>
              </div>
              <h3 id={titleId} className="modal-title">Error</h3>
              <p id={messageId} className="modal-message">{message}</p>
              <button
                ref={initialFocusRef}
                onClick={() => {
                  clearMessage();
                  lastMessageRef.current = '';
                }}
                className="btn btn-save btn-single"
              >
                Close
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
