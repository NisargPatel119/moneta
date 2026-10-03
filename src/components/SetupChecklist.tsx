'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

type Status = { database: boolean; plaid: boolean; plaidEnv: string; plaidRedirect: boolean; ai: boolean; cron: boolean };

// Shows which environment variables are configured, so a new self-hoster knows what's left
export function SetupChecklist() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch('/api/setup-status').then(r => r.json()).then(setStatus).catch(() => {});
  }, []);

  if (!status) return null;

  const items = [
    { ok: status.database, label: 'Database', hint: 'DATABASE_URL (free Neon Postgres)', required: true },
    { ok: status.plaid, label: 'Plaid', hint: `PLAID_CLIENT_ID + PLAID_SECRET · environment: ${status.plaidEnv}`, required: true },
    { ok: status.ai, label: 'AI assistant', hint: 'GROQ_API_KEY (free, optional)', required: false },
    { ok: status.cron, label: 'Daily sync', hint: 'CRON_SECRET (optional, keeps history building when the app is closed)', required: false },
    { ok: status.plaidRedirect, label: 'Phone OAuth redirect', hint: 'PLAID_REDIRECT_URI (optional, helps big banks on mobile)', required: false },
  ];

  return (
    <div className="text-left mt-8 border-t border-slate-100 pt-6">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Setup checklist</p>
      <ul className="space-y-2.5">
        {items.map(i => (
          <li key={i.label} className="flex items-start gap-2.5 text-sm">
            {i.ok
              ? <CheckCircle2 size={18} className="text-green-600 shrink-0 mt-px" />
              : <Circle size={18} className={i.required ? 'text-amber-500 shrink-0 mt-px' : 'text-slate-300 shrink-0 mt-px'} />}
            <span>
              <span className="font-semibold text-slate-800">{i.label}</span>
              {!i.required && <span className="text-slate-400"> (optional)</span>}
              <span className="block text-xs text-slate-500">{i.hint}</span>
            </span>
          </li>
        ))}
      </ul>
      {status.plaidEnv === 'sandbox' && (
        <p className="text-xs text-slate-500 mt-4 bg-slate-50 rounded-xl p-3">
          You&apos;re in Plaid <b>sandbox</b>: link a test bank with username <code>user_good</code> / password <code>pass_good</code>.
          Set <code>PLAID_ENV=production</code> to connect real accounts.
        </p>
      )}
    </div>
  );
}
