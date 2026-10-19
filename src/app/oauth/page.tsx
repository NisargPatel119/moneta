'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePlaidLink } from 'react-plaid-link';
import { LINK_MODE_KEY, LINK_TOKEN_KEY, exchangePublicToken } from '@/components/usePlaidConnect';
import { usePref } from '@/components/ui';

const noopSubscribe = () => () => {};

// Banks that use OAuth send the user back here (PLAID_REDIRECT_URI) after they sign in.
// We resume the same Plaid Link session, save the account, then return to the dashboard.
export default function OAuthRedirectPage() {
  const [token] = usePref(LINK_TOKEN_KEY);
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [status, setMessage] = useState<string | null>(null);
  const message = status
    ?? (mounted && !token ? 'This link session expired. Go back and start linking again.' : 'Finishing your bank connection…');

  const onSuccess = useCallback(async (public_token: string) => {
    setMessage('Saving your account…');
    let update = false;
    try { update = localStorage.getItem(LINK_MODE_KEY) === 'update'; } catch {}
    // Reconnecting keeps the existing connection, so there's nothing to save
    const ok = update || await exchangePublicToken(public_token);
    try { localStorage.removeItem(LINK_TOKEN_KEY); localStorage.removeItem(LINK_MODE_KEY); } catch {}
    if (ok) window.location.replace('/');
    else setMessage('Saving the account failed. Please try again from the dashboard.');
  }, []);

  const { open, ready } = usePlaidLink({
    token,
    onSuccess: publicToken => { if (publicToken) void onSuccess(publicToken); },
    receivedRedirectUri: typeof window !== 'undefined' ? window.location.href : undefined,
    onExit: () => window.location.replace('/'),
  });

  useEffect(() => {
    if (ready) open();
  }, [ready, open]);

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-muted font-medium">{message}</p>
      <Link href="/" className="text-sm font-semibold text-accent">Back to dashboard</Link>
    </div>
  );
}
