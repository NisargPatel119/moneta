'use client';
import { useActionState } from 'react';
import { LineChart, Lock } from 'lucide-react';
import { login } from './actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="bg-blue-600 text-white p-2 rounded-xl shadow-inner shadow-blue-700/50">
            <LineChart size={24} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Moneta</h1>
        </div>

        <form action={action} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center gap-2 text-slate-700">
            <Lock size={18} className="text-blue-600" />
            <h2 className="text-lg font-bold">Sign in</h2>
          </div>

          {/* Hidden username helps iOS/password managers save the credential */}
          <input type="text" name="username" autoComplete="username" defaultValue="me" hidden readOnly />

          <div className="space-y-2">
            <label htmlFor="password" className="text-slate-500 text-xs font-bold uppercase tracking-wider">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-base font-medium shadow-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {state?.error && (
            <p className="text-sm font-semibold text-red-600" role="alert">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold shadow-md shadow-blue-600/20 hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
