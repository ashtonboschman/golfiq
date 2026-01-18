'use client';

import { useEffect } from 'react';

export default function BootstrapClient() {
  useEffect(() => {
    fetch('/api/bootstrap', { method: 'POST' });
  }, []);

  return null;
}