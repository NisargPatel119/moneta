'use client';
import { useActionState } from 'react';
import { Lock } from 'lucide-react';
import { Logo } from '@/components/ui';
import { login } from './actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <div className="min-h-screen bg-canvas font-sans text-ink flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <Logo size="lg" />
          <h1 className="font-display text-4xl tracking-tight">Moneta</h1>
        </div>

        <form action={action} className="bg-surface p-8 rounded-2xl border border-line space-y-5">
          <div className="flex items-center gap-2 text-ink-2">
            <Lock size={18} className="text-accent" />
            <h2 className="font-display text-3xl">Sign in</h2>
          </div>

          {/* Hidden username helps iOS/password managers save the credential */}
          <input type="text" name="username" autoComplete="username" defaultValue="me" hidden readOnly />

          <div className="space-y-2">
            <label htmlFor="password" className="text-muted eyebrow">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              className="w-full bg-surface border border-line-strong rounded-xl px-4 py-3 text-base font-medium outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
          </div>

          {state?.error && (
            <p className="text-sm font-semibold text-negative" role="alert">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-accent text-on-accent py-3 rounded-xl font-semibold hover:bg-accent-strong transition-colors disabled:opacity-60"
          >
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
