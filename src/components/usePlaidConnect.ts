'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/errors';
import { usePlaidLink } from 'react-plaid-link';

export type LinkKind = 'bank' | 'brokerage';

// The OAuth redirect page needs the same link token to resume Plaid Link
export const LINK_TOKEN_KEY = 'ws_plaid_link_token';
// …and whether it was fixing an existing connection ("update") rather than adding one
export const LINK_MODE_KEY = 'ws_plaid_link_mode';

export type ReconnectMode = 'reconnect' | 'consent';

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
  // Update mode reuses the existing connection: there's no new token to exchange
  const updating = useRef(false);
  const [status, setStatus] = useState<'idle' | 'preparing' | 'linking' | 'linked' | 'reconnected' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const onSuccess = useCallback(async (public_token: string) => {
    try { localStorage.removeItem(LINK_MODE_KEY); } catch {}
    if (updating.current) {
      setStatus('reconnected');
      onLinked();
      return;
    }
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

  const launch = useCallback(async (body: Record<string, string>, update: boolean) => {
    setStatus('preparing');
    setError(null);
    updating.current = update;
    try {
      const res = await fetch('/api/plaid/create-link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.link_token) throw new Error(data.error || 'Could not start Plaid. Check PLAID_CLIENT_ID and PLAID_SECRET.');
      try {
        localStorage.setItem(LINK_TOKEN_KEY, data.link_token);
        localStorage.setItem(LINK_MODE_KEY, update ? 'update' : 'new');
      } catch {}
      openWhenReady.current = true;
      setToken(data.link_token);
    } catch (e) {
      console.error('Failed to start Plaid Link', e);
      setError(errorMessage(e));
      setStatus('error');
    }
  }, []);

  // Link a new bank or brokerage
  const start = useCallback((kind: LinkKind) => launch({ kind }, false), [launch]);
  // Sign back in to a broken connection (or grant investment access) without creating a duplicate
  const reconnect = useCallback((itemId: string, mode: ReconnectMode = 'reconnect') => launch({ item_id: itemId, mode }, true), [launch]);

  return { start, reconnect, status, error, clearStatus: () => { setStatus('idle'); setError(null); } };
}
