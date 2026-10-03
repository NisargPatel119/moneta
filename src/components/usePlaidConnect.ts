'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';

export type LinkKind = 'bank' | 'brokerage';

// Call this once per page: Plaid Link only supports being embedded once.
// The link token is created on demand because banks and brokerages need different configs.
export function usePlaidConnect(onLinked: () => void) {
  const [token, setToken] = useState<string | null>(null);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'preparing' | 'linking' | 'linked' | 'error'>('idle');

  const onSuccess = useCallback(async (public_token: string) => {
    setStatus('linking');
    const response = await fetch('/api/plaid/exchange-public-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_token }),
    });
    setStatus(response.ok ? 'linked' : 'error');
    if (response.ok) onLinked();
  }, [onLinked]);

  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit: () => setStatus(s => (s === 'preparing' ? 'idle' : s)),
  });

  // Open Plaid as soon as the freshly created token is ready
  useEffect(() => {
    if (pendingOpen && ready) {
      setPendingOpen(false);
      setStatus('idle');
      open();
    }
  }, [pendingOpen, ready, open]);

  const start = useCallback(async (kind: LinkKind) => {
    setStatus('preparing');
    try {
      const res = await fetch('/api/plaid/create-link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json();
      if (!data.link_token) throw new Error(data.error || 'No link token');
      setToken(data.link_token);
      setPendingOpen(true);
    } catch (e) {
      console.error('Failed to start Plaid Link', e);
      setStatus('error');
    }
  }, []);

  return { start, status, clearStatus: () => setStatus('idle') };
}
