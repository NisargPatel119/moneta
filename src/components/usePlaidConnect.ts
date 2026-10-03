'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/errors';
import { usePlaidLink } from 'react-plaid-link';

export type LinkKind = 'bank' | 'brokerage';

// The OAuth redirect page needs the same link token to resume Plaid Link
export const LINK_TOKEN_KEY = 'ws_plaid_link_token';

export async function exchangePublicToken(public_token: string) {
  const response = await fetch('/api/plaid/exchange-public-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_token }),
  });
  return response.ok;
}

// Call this once per page: Plaid Link only supports being embedded once.
// The link token is created on demand because banks and brokerages need different configs.
export function usePlaidConnect(onLinked: () => void) {
  const [token, setToken] = useState<string | null>(null);
  const openWhenReady = useRef(false);
  const [status, setStatus] = useState<'idle' | 'preparing' | 'linking' | 'linked' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const onSuccess = useCallback(async (public_token: string) => {
    setStatus('linking');
    const ok = await exchangePublicToken(public_token);
    setStatus(ok ? 'linked' : 'error');
    if (!ok) setError('Plaid connected, but saving the account failed. Check your database settings.');
    if (ok) onLinked();
  }, [onLinked]);

  const { open, ready } = usePlaidLink({
    token,
    onSuccess: publicToken => { if (publicToken) void onSuccess(publicToken); },
    onExit: () => setStatus(s => (s === 'preparing' ? 'idle' : s)),
  });

  // Open Plaid as soon as the freshly created token is ready.
  // Status stays 'preparing' (link button disabled) until Plaid reports success or exit.
  useEffect(() => {
    if (openWhenReady.current && ready) {
      openWhenReady.current = false;
      open();
    }
  }, [ready, open]);

  const start = useCallback(async (kind: LinkKind) => {
    setStatus('preparing');
    setError(null);
    try {
      const res = await fetch('/api/plaid/create-link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json();
      if (!data.link_token) throw new Error(data.error || 'Could not start Plaid. Check PLAID_CLIENT_ID and PLAID_SECRET.');
      try { localStorage.setItem(LINK_TOKEN_KEY, data.link_token); } catch {}
      openWhenReady.current = true;
      setToken(data.link_token);
    } catch (e) {
      console.error('Failed to start Plaid Link', e);
      setError(errorMessage(e));
      setStatus('error');
    }
  }, []);

  return { start, status, error, clearStatus: () => { setStatus('idle'); setError(null); } };
}
