'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, CheckCircle2, ChartPie, Eye, EyeOff, Landmark, LayoutDashboard, LineChart, LogOut, Plus, Receipt,
  RefreshCw, Sparkles, TriangleAlert, X,
} from 'lucide-react';
import { logout } from '@/app/login/actions';
import { type LinkKind, usePlaidConnect } from '@/components/usePlaidConnect';
import { Overview } from '@/components/Overview';
import { Spending } from '@/components/Spending';
import { Accounts } from '@/components/Accounts';
import { Investments } from '@/components/Investments';
import { Assistant, type ChatMessage } from '@/components/Assistant';
import { Card, PrivacyProvider, Skeleton, TextSizeControl, cn, usePrivacy } from '@/components/ui';
import { type DashboardData, timeAgo } from '@/lib/finance';

type Tab = 'overview' | 'spending' | 'investments' | 'accounts' | 'assistant';

const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'spending', label: 'Spending', icon: Receipt },
  { id: 'investments', label: 'Investing', icon: ChartPie },
  { id: 'accounts', label: 'Accounts', icon: Building2 },
  { id: 'assistant', label: 'Ask AI', icon: Sparkles },
];

export default function Home() {
  return (
    <PrivacyProvider>
      <Dashboard />
    </PrivacyProvider>
  );
}

function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [category, setCategory] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [, forceTick] = useState(0);
  const { hidden, toggle } = usePrivacy();

  const load = useCallback(() => {
    setRefreshing(true);
    setError(null);
    fetch('/api/dashboard')
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Something went wrong');
        setData(body);
      })
      .catch(e => setError(e.message))
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keep the "Updated x min ago" label fresh
  useEffect(() => {
    const id = setInterval(() => forceTick(n => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const plaid = usePlaidConnect(load);

  const accountName = useMemo(() => {
    const names = new Map(data?.accounts.map(a => [a.account_id, a.mask ? `${a.name} ••${a.mask}` : a.name]));
    return (id: string) => names.get(id);
  }, [data]);

  const goTo = (next: Tab, cat?: string) => {
    setTab(next);
    setCategory(cat ?? null);
    window.scrollTo({ top: 0 });
  };

  const initialLoading = !data && !error;

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900 selection:bg-blue-100">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur border-b border-slate-200 sticky top-0 z-20 pt-[env(safe-area-inset-top)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-blue-600 text-white p-1.5 rounded-xl shadow-inner shadow-blue-700/50 shrink-0">
              <LineChart size={22} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight leading-tight">WealthSync</h1>
              {data?.fetchedAt && (
                <p className="text-[11px] text-slate-500 font-medium leading-tight truncate">
                  {refreshing ? 'Refreshing…' : `Updated ${timeAgo(data.fetchedAt)}`}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <IconButton label={refreshing ? 'Refreshing' : 'Refresh'} onClick={load} disabled={refreshing}>
              <RefreshCw size={18} className={cn(refreshing && 'animate-spin')} />
            </IconButton>
            <IconButton label={hidden ? 'Show amounts' : 'Hide amounts'} onClick={toggle}>
              {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
            </IconButton>
            <TextSizeControl />
            <LinkMenu onPick={plaid.start} busy={plaid.status === 'preparing'} />
            <form action={logout}>
              <IconButton label="Log out" type="submit"><LogOut size={18} /></IconButton>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 md:py-10 pb-28 md:pb-10">
        <LinkStatus status={plaid.status} onClose={plaid.clearStatus} />

        {initialLoading ? (
          <LoadingSkeleton />
        ) : error && !data ? (
          <Card className="p-10 text-center max-w-lg mx-auto mt-6">
            <TriangleAlert className="mx-auto text-amber-500" size={32} />
            <h2 className="text-lg font-bold mt-4">Couldn&apos;t load your data</h2>
            <p className="text-slate-500 mt-2 text-sm">{error}</p>
            <button onClick={load} className="mt-6 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700">Try again</button>
          </Card>
        ) : !data?.linked ? (
          <Card className="p-10 sm:p-12 text-center max-w-lg mx-auto mt-6">
            <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
              <Building2 size={28} />
            </div>
            <h2 className="text-2xl font-semibold mt-6">Connect your first account</h2>
            <p className="text-slate-500 mt-3 leading-relaxed">
              Link your bank, credit card, or investment accounts securely with Plaid to see your net worth and track spending.
            </p>
            <button
              onClick={() => plaid.start('bank')}
              disabled={plaid.status === 'preparing'}
              className="mt-8 bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold shadow-md shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
            >
              <Plus size={18} /> Link a bank or card
            </button>
            <button
              onClick={() => plaid.start('brokerage')}
              disabled={plaid.status === 'preparing'}
              className="mt-3 block mx-auto text-sm font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              or link a brokerage / retirement account
            </button>
          </Card>
        ) : (
          <div className="flex gap-10">
            {/* Desktop sidebar */}
            <aside className="hidden md:block w-56 shrink-0">
              <nav className="space-y-1.5 sticky top-26">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => goTo(id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-semibold transition-all',
                      tab === id ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
                    )}
                  >
                    <Icon size={20} className={tab === id ? 'text-blue-100' : 'text-slate-400'} />
                    {label}
                  </button>
                ))}
              </nav>
            </aside>

            <section className="flex-1 min-w-0 space-y-5">
              {error && (
                <Banner tone="warn">Couldn&apos;t refresh just now ({error}). Showing your last loaded data.</Banner>
              )}
              {data.issues?.map(issue => (
                <Banner key={issue.item_id} tone="warn" action={
                  issue.code === 'ITEM_LOGIN_REQUIRED' ? undefined : <button onClick={load} className="font-semibold underline">Retry</button>
                }>
                  {issue.code === 'ITEM_LOGIN_REQUIRED'
                    ? 'One of your banks needs you to sign in again. Re-link it with "Link account".'
                    : issue.code === 'ADDITIONAL_CONSENT_REQUIRED'
                      ? 'To see holdings for one of your accounts, re-link it with "Link account" → Brokerage.'
                      : issue.message}
                </Banner>
              ))}

              <h2 className="text-xl font-bold">{TABS.find(t => t.id === tab)?.label}</h2>

              {tab === 'overview' && <Overview data={data} goTo={goTo} accountName={accountName} />}
              {tab === 'spending' && <Spending data={data} accountName={accountName} category={category} setCategory={setCategory} />}
              {tab === 'investments' && <Investments data={data} onLinkBrokerage={() => plaid.start('brokerage')} />}
              {tab === 'accounts' && <Accounts data={data} />}
              {tab === 'assistant' && <Assistant messages={chat} setMessages={setChat} />}
            </section>
          </div>
        )}
      </main>

      {/* Mobile bottom tab bar */}
      {data?.linked && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-5">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => goTo(id)}
                className={cn('flex flex-col items-center gap-1 py-2 text-[11px] font-semibold transition-colors', tab === id ? 'text-blue-600' : 'text-slate-500')}
              >
                <Icon size={20} />
                {label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

function IconButton({ label, children, ...props }: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      title={label}
      aria-label={label}
      className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors disabled:opacity-60"
      {...props}
    >
      {children}
    </button>
  );
}

function LinkMenu({ onPick, busy }: { onPick: (kind: LinkKind) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    // Defer so the click that opened the menu doesn't immediately close it
    const id = setTimeout(() => document.addEventListener('click', close), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', close); };
  }, [open]);

  const options: { kind: LinkKind; label: string; hint: string; icon: typeof Landmark }[] = [
    { kind: 'bank', label: 'Bank or credit card', hint: 'Checking, savings, cards, loans', icon: Landmark },
    { kind: 'brokerage', label: 'Brokerage or retirement', hint: 'Fidelity, Vanguard, Schwab, 401(k), IRA…', icon: ChartPie },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        aria-expanded={open}
        className="flex items-center gap-1.5 bg-slate-900 text-white h-10 px-3 sm:px-4 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-slate-800 transition-colors"
      >
        {busy ? <RefreshCw size={18} className="animate-spin" /> : <Plus size={18} />}
        <span className="hidden sm:inline">Link account</span>
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-30 w-72 bg-white rounded-2xl border border-slate-200 shadow-lg p-2">
          {options.map(({ kind, label, hint, icon: Icon }) => (
            <button key={kind} onClick={() => onPick(kind)} className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 text-left">
              <Icon size={18} className="text-blue-600 mt-0.5 shrink-0" />
              <span>
                <span className="block font-semibold text-slate-900 text-sm">{label}</span>
                <span className="block text-xs text-slate-500 mt-0.5">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Banner({ tone, children, action }: { tone: 'warn' | 'ok'; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={cn(
      'flex items-start gap-3 rounded-2xl border p-4 text-sm font-medium',
      tone === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-green-50 border-green-200 text-green-900'
    )}>
      {tone === 'warn' ? <TriangleAlert size={18} className="shrink-0 mt-0.5" /> : <CheckCircle2 size={18} className="shrink-0 mt-0.5" />}
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}

function LinkStatus({ status, onClose }: { status: string; onClose: () => void }) {
  if (status === 'idle') return null;
  if (status === 'preparing') return null;
  const text = status === 'linking' ? 'Connecting your account…' : status === 'linked' ? 'Account linked! Loading your new data…' : 'Failed to link the account. Please try again.';
  return (
    <div className="mb-5">
      <Banner tone={status === 'error' ? 'warn' : 'ok'} action={<button onClick={onClose} aria-label="Dismiss"><X size={16} /></button>}>
        {text}
      </Banner>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex gap-10">
      <div className="hidden md:block w-56 space-y-2">
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-12" />)}
      </div>
      <div className="flex-1 space-y-5">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-56" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <p className="text-center text-sm text-slate-400 font-medium">Syncing with your banks…</p>
      </div>
    </div>
  );
}
