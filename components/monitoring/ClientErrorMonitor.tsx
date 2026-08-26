'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { reportClientError } from '@/lib/monitoring/client';
import { isNativeApp } from '@/lib/platform';

export default function ClientErrorMonitor() {
  const pathname = usePathname();

  useEffect(() => {
    const area = isNativeApp() ? 'webview' : 'client';

    const handleError = (event: ErrorEvent) => {
      reportClientError(event.error ?? event.message, {
        area,
        operation: 'unhandled_error',
        severity: 'fatal',
        route: pathname,
        recoverable: false,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportClientError(event.reason, {
        area,
        operation: 'unhandled_promise_rejection',
        severity: 'fatal',
        route: pathname,
        recoverable: false,
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [pathname]);

  return null;
}
