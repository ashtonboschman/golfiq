'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function BootstrapClient() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === '/offline') return;
    fetch('/api/bootstrap', { method: 'POST' }).catch(() => undefined);
  }, [pathname]);

  return null;
}
