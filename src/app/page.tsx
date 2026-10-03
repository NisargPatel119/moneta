'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, CheckCircle2, ChartPie, Eye, EyeOff, Landmark, LayoutDashboard, LogOut, Plus, Receipt,
  RefreshCw, Sparkles, TriangleAlert, X,
} from 'lucide-react';
import { logout } from '@/app/login/actions';
import { type LinkKind, usePlaidConnect } from '@/components/usePlaidConnect';
import { Overview } from '@/components/Overview';
import { Spending } from '@/components/Spending';
import { Accounts } from '@/components/Accounts';
import { Investments } from '@/components/Investments';
import { Assistant, type ChatMessage } from '@/components/Assistant';
import { SetupChecklist } from '@/components/SetupChecklist';
import { TransferSettings } from '@/components/TransferSettings';
import { TransactionEditor, type TxnEdit } from '@/components/TransactionEditor';
import { Recurring } from '@/components/Recurring';
import { detectRecurring } from '@/lib/recurring';
import { DEFAULT_TRANSFER_RULES, makeTxnRules, type TransferRules } from '@/lib/transfers';
import { Card, Logo, PrivacyProvider, Skeleton, TextSizeControl, cn, usePrivacy } from '@/components/ui';
import { type CategoryRule, type DashboardData, type Txn, merchantKey, timeAgo } from '@/lib/finance';

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
  const [refreshing, setRefreshing] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [category, setCategory] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [transfersOpen, setTransfersOpen] = useState(false);
  const [spendingView, setSpendingView] = useState<'activity' | 'recurring'>('activity');
  const [selectedTxn, setSelectedTxn] = useState<Txn | null>(null);
  const [, forceTick] = useState(0);
  const { hidden, toggle } = usePrivacy();

  // Only sets state in callbacks, so it can run straight from the mount effect
  // refresh=true makes the server sync with Plaid even if it synced recently
  const fetchData = useCallback((refresh = false) => {
    fetch(refresh ? '/api/dashboard?refresh=1' : '/api/dashboard')
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Something went wrong');
        setData(body);
        setError(null);
      })
      .catch(e => setError(e.message))
      .finally(() => setRefreshing(false));
  }, []);

  const load = useCallback(() => {
    setRefreshing(true);
    fetchData(true);
  }, [fetchData]);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const txnRules = useMemo(
    () => makeTxnRules(data?.transactions ?? [], data?.settings?.transferRules ?? DEFAULT_TRANSFER_RULES),
    [data]
  );


  const recurring = useMemo(
    () => (data ? detectRecurring(data.transactions, txnRules, data.settings?.dismissedRecurring ?? []) : []),
    [data, txnRules]
  );

  // Optimistic: apply immediately, then save so other devices (and the AI) use the same settings
  const saveSettings = (patch: Partial<DashboardData['settings']>) => {
    setData(d => (d ? { ...d, settings: { ...d.settings, ...patch } } : d));
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(res => { if (!res.ok) throw new Error(); })
      .catch(() => setError('Could not save your settings. They will reset when you reload.'));
  };

  // Optimistic edit, then reload from the server so rules apply everywhere they should
  const saveTxnEdit = async (txn: Txn, edit: TxnEdit) => {
    const key = merchantKey(txn);
    setData(d => d && {
      ...d,
      // Show the new merchant rule in the Rules sheet right away
      rules: edit.applyToMerchant
        ? [{ id: -Date.now(), merchant_key: key, category: edit.category ?? null, rename: edit.name ?? null }, ...d.rules.filter(r => r.merchant_key !== key)]
        : d.rules,
      transactions: d.transactions.map(t => {
        const affected = edit.applyToMerchant ? merchantKey(t) === key : t.transaction_id === txn.transaction_id;
        if (!affected) return t;
        return {
          ...t,
          ...('category' in edit && { user_category: edit.category ?? null }),
          ...('name' in edit && { user_name: edit.name ?? null }),
          ...(t.transaction_id === txn.transaction_id && 'notes' in edit && { notes: edit.notes ?? null }),
          edited: edit.applyToMerchant ? 'rule' : ('category' in edit && edit.category == null && 'name' in edit && edit.name == null) ? null : 'manual',
        };
      }),
    });
    const res = await fetch(`/api/transactions/${encodeURIComponent(txn.transaction_id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edit),
    });
    if (!res.ok) setError('Could not save that change.');
    // The demo doesn't save edits on the server, so keep the local copy instead of reloading
    if (!data?.demo) fetchData();
  };

  const deleteRule = async (rule: CategoryRule) => {
    setData(d => d && { ...d, rules: d.rules.filter(r => r.id !== rule.id) });
    const res = await fetch(`/api/rules/${rule.id}`, { method: 'DELETE' });
    if (!res.ok) setError('Could not delete that rule.');
    if (!data?.demo) fetchData();
  };

  const goTo = (next: Tab, cat?: string) => {
    if (next === 'spending') setSpendingView('activity');
    setTab(next);
    setCategory(cat ?? null);
    window.scrollTo({ top: 0 });
  };

  const initialLoading = !data && !error;

  return (
    <div className="min-h-screen bg-canvas font-sans text-ink selection:bg-accent-soft">
      {/* Header */}
      <header className="bg-surface/90 backdrop-blur border-b border-line sticky top-0 z-20 pt-[env(safe-area-inset-top)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Logo />
            <div className="min-w-0">
              <h1 className="font-display text-2xl tracking-tight leading-none">Moneta</h1>
              {data?.fetchedAt && (
                <p className="text-[11px] text-muted font-medium leading-tight truncate">
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
            {!data?.demo && <form action={logout}>
              <IconButton label="Log out" type="submit"><LogOut size={18} /></IconButton>
            </form>}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 md:py-10 pb-28 md:pb-10">
        <LinkStatus status={plaid.status} error={plaid.error} onClose={plaid.clearStatus} />

        {initialLoading ? (
          <LoadingSkeleton />
        ) : error && !data ? (
          <Card className="p-10 text-center max-w-lg mx-auto mt-6">
            <TriangleAlert className="mx-auto text-warn" size={32} />
            <h2 className="font-display text-3xl mt-4">Couldn&apos;t load your data</h2>
            <p className="text-muted mt-2 text-sm">{error}</p>
            <button onClick={load} className="mt-6 bg-accent text-on-accent px-5 py-2.5 rounded-xl font-semibold hover:bg-accent-strong">Try again</button>
            <SetupChecklist />
          </Card>
        ) : !data?.linked ? (
          <Card className="p-10 sm:p-12 text-center max-w-lg mx-auto mt-6">
            <div className="mx-auto w-16 h-16 bg-accent-soft rounded-full flex items-center justify-center text-accent">
              <Building2 size={28} />
            </div>
            <h2 className="font-display text-4xl tracking-tight mt-6">Connect your first account</h2>
            <p className="text-muted mt-3 leading-relaxed">
              Link your bank, credit card, or investment accounts securely with Plaid to see your net worth and track spending.
            </p>
            <button
              onClick={() => plaid.start('bank')}
              disabled={plaid.status === 'preparing'}
              className="mt-8 bg-accent text-on-accent px-6 py-3 rounded-xl font-semibold hover:bg-accent-strong disabled:opacity-50 inline-flex items-center gap-2"
            >
              <Plus size={18} /> Link a bank or card
            </button>
            <button
              onClick={() => plaid.start('brokerage')}
              disabled={plaid.status === 'preparing'}
              className="mt-3 block mx-auto text-sm font-semibold text-accent hover:text-accent disabled:opacity-50"
            >
              or link a brokerage / retirement account
            </button>
            <SetupChecklist />
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
                      tab === id ? 'bg-surface text-ink ring-1 ring-line' : 'text-muted hover:bg-sunken hover:text-ink'
                    )}
                  >
                    <Icon size={20} className={tab === id ? 'text-accent' : 'text-faint'} />
                    {label}
                  </button>
                ))}
              </nav>
            </aside>

            <section className="flex-1 min-w-0 space-y-5">
              {error && (
                <Banner tone="warn">Couldn&apos;t refresh just now ({error}). Showing your last loaded data.</Banner>
              )}
              {data.demo && (
                <Banner tone="ok">
                  You&apos;re exploring Moneta with made-up demo data. Edits last until you reload.{' '}
                  <a href="https://github.com/NisargPatel119/moneta" className="font-semibold underline">Set up your own</a>
                </Banner>
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

              <h2 className="font-display text-4xl tracking-tight">{TABS.find(t => t.id === tab)?.label}</h2>

              {tab === 'overview' && (
                <Overview
                  data={data}
                  rules={txnRules}
                  recurring={recurring}
                  goTo={goTo}
                  onOpenRecurring={() => { goTo('spending'); setSpendingView('recurring'); }}
                  onSelect={setSelectedTxn}
                  accountName={accountName}
                />
              )}
              {tab === 'spending' && (
                <>
                  <div className="inline-flex bg-sunken rounded-xl p-1">
                    {(['activity', 'recurring'] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => setSpendingView(v)}
                        className={cn(
                          'px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors',
                          spendingView === v ? 'bg-surface text-ink' : 'text-muted hover:text-ink'
                        )}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  {spendingView === 'activity' ? (
                    <Spending
                      data={data}
                      rules={txnRules}
                      accountName={accountName}
                      category={category}
                      setCategory={setCategory}
                      onOpenTransfers={() => setTransfersOpen(true)}
                      onSelect={setSelectedTxn}
                    />
                  ) : (
                    <Recurring
                      items={recurring}
                      dismissedCount={data.settings?.dismissedRecurring?.length ?? 0}
                      onDismiss={key => saveSettings({ dismissedRecurring: [...(data.settings?.dismissedRecurring ?? []), key] })}
                      onRestoreAll={() => saveSettings({ dismissedRecurring: [] })}
                    />
                  )}
                </>
              )}
              {tab === 'investments' && <Investments data={data} onLinkBrokerage={() => plaid.start('brokerage')} />}
              {tab === 'accounts' && <Accounts data={data} onChanged={load} />}
              {tab === 'assistant' && <Assistant messages={chat} setMessages={setChat} />}
            </section>
          </div>
        )}
      </main>

      {data && (
        <TransferSettings
          open={transfersOpen}
          onClose={() => setTransfersOpen(false)}
          transactions={data.transactions}
          txnRules={txnRules}
          onChange={(transferRules: TransferRules) => saveSettings({ transferRules })}
          merchantRules={data.rules ?? []}
          onDeleteRule={deleteRule}
        />
      )}

      {data && (
        <TransactionEditor
          key={selectedTxn?.transaction_id ?? 'none'}
          txn={selectedTxn}
          rule={selectedTxn && selectedTxn.edited === 'rule'
            ? data.rules?.find(r => r.merchant_key === merchantKey(selectedTxn)) ?? null
            : null}
          accountName={selectedTxn ? accountName(selectedTxn.account_id) : undefined}
          onClose={() => setSelectedTxn(null)}
          onSave={saveTxnEdit}
          onDeleteRule={deleteRule}
        />
      )}

      {/* Mobile bottom tab bar */}
      {data?.linked && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-surface/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-5">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => goTo(id)}
                className={cn('flex flex-col items-center gap-1 py-2 text-[11px] font-semibold transition-colors', tab === id ? 'text-accent' : 'text-muted')}
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
      className="w-10 h-10 flex items-center justify-center rounded-xl text-muted hover:bg-sunken hover:text-ink transition-colors disabled:opacity-60"
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
        className="flex items-center gap-1.5 bg-ink text-canvas h-10 px-3 sm:px-4 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-ink-2 transition-colors"
      >
        {busy ? <RefreshCw size={18} className="animate-spin" /> : <Plus size={18} />}
        <span className="hidden sm:inline">Link account</span>
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-30 w-72 bg-surface rounded-2xl border border-line shadow-lg p-2">
          {options.map(({ kind, label, hint, icon: Icon }) => (
            <button key={kind} onClick={() => onPick(kind)} className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-sunken text-left">
              <Icon size={18} className="text-accent mt-0.5 shrink-0" />
              <span>
                <span className="block font-semibold text-ink text-sm">{label}</span>
                <span className="block text-xs text-muted mt-0.5">{hint}</span>
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
      tone === 'warn' ? 'bg-warn-soft border-warn/30 text-warn' : 'bg-positive-soft border-positive/30 text-positive'
    )}>
      {tone === 'warn' ? <TriangleAlert size={18} className="shrink-0 mt-0.5" /> : <CheckCircle2 size={18} className="shrink-0 mt-0.5" />}
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}

function LinkStatus({ status, error, onClose }: { status: string; error: string | null; onClose: () => void }) {
  if (status === 'idle') return null;
  if (status === 'preparing') return null;
  const text = status === 'linking' ? 'Connecting your account…' : status === 'linked' ? 'Account linked! Loading your new data…' : error || 'Failed to link the account. Please try again.';
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
        <p className="text-center text-sm text-faint font-medium">Syncing with your banks…</p>
      </div>
    </div>
  );
}
