'use client';
import { useState } from 'react';
import { Banknote, ChevronRight, CreditCard, House, LineChart, Plus, RefreshCw, TriangleAlert, Unlink, Wallet, type LucideIcon } from 'lucide-react';
import {
  ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER, ASSET_KIND_META, type Account, type DashboardData, type ManualAsset, isLiability, timeAgo,
} from '@/lib/finance';
import type { ReconnectMode } from './usePlaidConnect';
import { Card, Money, cn } from './ui';

const TYPE_ICONS: Record<string, LucideIcon> = {
  depository: Wallet,
  credit: CreditCard,
  investment: LineChart,
  loan: Banknote,
};

export function Accounts({ data, onChanged, onReconnect, reconnecting, onAccount, onEditAsset }: {
  data: DashboardData;
  onChanged: () => void;
  onReconnect: (itemId: string, mode: ReconnectMode) => void;
  reconnecting: boolean;
  onAccount: (a: Account) => void;
  onEditAsset: (asset: ManualAsset | 'new') => void;
}) {
  const groups = ACCOUNT_TYPE_ORDER
    .map(type => {
      const accounts = data.accounts.filter(a => (a.type ?? 'other') === type);
      return { type, accounts, total: accounts.reduce((s, a) => s + (a.balances.current ?? 0), 0) };
    })
    .filter(g => g.accounts.length > 0);

  return (
    <div className="space-y-6">
      {groups.map(g => {
        const Icon = TYPE_ICONS[g.type] ?? Wallet;
        const owed = g.type === 'credit' || g.type === 'loan';
        return (
          <section key={g.type}>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <Icon size={18} className="text-accent" />
                <h3 className="font-bold text-ink">{ACCOUNT_TYPE_LABELS[g.type] ?? g.type}</h3>
                <span className="bg-line text-muted text-xs font-bold px-2 py-0.5 rounded-full">{g.accounts.length}</span>
              </div>
              <div className="text-right">
                <Money value={g.total} className={cn('font-bold', owed ? 'text-ink' : 'text-positive')} />
                {owed && <p className="eyebrow text-[10px] text-faint">owed</p>}
              </div>
            </div>
            <Card className="divide-y divide-line overflow-hidden">
              {g.accounts.map(a => <AccountRow key={a.account_id} a={a} onOpen={() => onAccount(a)} />)}
            </Card>
          </section>
        );
      })}

      <ManualAssets assets={data.manualAssets ?? []} onEdit={onEditAsset} />
      <Connections data={data} onChanged={onChanged} onReconnect={onReconnect} reconnecting={reconnecting} />
    </div>
  );
}

// Things the user tracks by hand (home, car, crypto…)
function ManualAssets({ assets, onEdit }: { assets: ManualAsset[]; onEdit: (asset: ManualAsset | 'new') => void }) {
  const total = assets.reduce((s, a) => s + a.value, 0);
  return (
    <section>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <House size={18} className="text-accent" />
          <h3 className="font-bold text-ink">Property & other assets</h3>
          {assets.length > 0 && <span className="bg-line text-muted text-xs font-bold px-2 py-0.5 rounded-full">{assets.length}</span>}
        </div>
        {assets.length > 0 && <Money value={total} className="font-bold text-positive" />}
      </div>
      <Card className="divide-y divide-line overflow-hidden">
        {assets.map(a => {
          const meta = ASSET_KIND_META[a.kind];
          const Icon = meta.icon;
          return (
            <button key={a.id} onClick={() => onEdit(a)} className="w-full flex items-center gap-3 p-4 sm:p-5 text-left hover:bg-sunken">
              <span className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0"><Icon size={18} /></span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-ink truncate">{a.name}</span>
                <span className="block text-xs text-muted font-medium mt-0.5 truncate">
                  {meta.label}
                  {a.annual_rate ? <> · est. {a.annual_rate > 0 ? '+' : ''}{a.annual_rate}%/yr</> : <> · entered by you</>}
                </span>
              </span>
              <Money value={a.value} className="font-bold text-lg text-positive shrink-0" />
            </button>
          );
        })}
        <button onClick={() => onEdit('new')} className="w-full flex items-center gap-3 p-4 sm:p-5 text-left text-accent font-semibold hover:bg-sunken">
          <span className="w-10 h-10 rounded-xl border border-dashed border-accent/50 flex items-center justify-center shrink-0"><Plus size={18} /></span>
          <span>
            Add a home, car, or other asset
            <span className="block text-xs text-muted font-medium mt-0.5">Track things your bank can&apos;t see, so your net worth is complete</span>
          </span>
        </button>
      </Card>
    </section>
  );
}

// One row per linked institution (Plaid "Item"): sync status, reconnect, disconnect
function Connections({ data, onChanged, onReconnect, reconnecting }: {
  data: DashboardData;
  onChanged: () => void;
  onReconnect: (itemId: string, mode: ReconnectMode) => void;
  reconnecting: boolean;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const connections = data.connections ?? [];
  if (connections.length === 0) return null;

  async function remove(itemId: string, institution: string) {
    if (!window.confirm(`Disconnect ${institution}? Its accounts will disappear from Moneta. You can link it again later.`)) return;
    setRemoving(itemId);
    const res = await fetch('/api/plaid/remove-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId }),
    });
    setRemoving(null);
    if (res.ok) onChanged();
    else window.alert('Could not disconnect. Please try again.');
  }

  return (
    <section>
      <h3 className="font-bold text-ink mb-3 px-1">Connections</h3>
      <Card className="divide-y divide-line overflow-hidden">
        {connections.map(c => {
          const needsFix = c.status === 'reconnect' || c.status === 'consent';
          return (
            <div key={c.item_id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{c.institution}</p>
                <p className={cn('text-xs font-medium flex items-center gap-1', c.status === 'ok' ? 'text-muted' : 'text-warn')}>
                  {c.status !== 'ok' && <TriangleAlert size={12} className="shrink-0" />}
                  {c.status === 'reconnect' ? 'Needs you to sign in again'
                    : c.status === 'consent' ? 'Needs permission to share investments'
                    : c.status === 'error' ? (c.message ?? 'Having trouble syncing')
                    : <>{c.accountCount} account{c.accountCount === 1 ? '' : 's'}{c.lastSyncedAt && <> · synced {timeAgo(c.lastSyncedAt)}</>}</>}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {needsFix && (
                  <button
                    onClick={() => onReconnect(c.item_id, c.status === 'consent' ? 'consent' : 'reconnect')}
                    disabled={reconnecting}
                    className="flex items-center gap-1.5 text-sm font-semibold bg-accent text-on-accent px-3 py-2 rounded-xl hover:bg-accent-strong disabled:opacity-50"
                  >
                    <RefreshCw size={15} /> {c.status === 'consent' ? 'Allow access' : 'Reconnect'}
                  </button>
                )}
                <button
                  onClick={() => remove(c.item_id, c.institution)}
                  disabled={removing === c.item_id}
                  className="flex items-center gap-1.5 text-sm font-semibold text-negative hover:bg-negative-soft px-3 py-2 rounded-xl disabled:opacity-50"
                >
                  <Unlink size={16} /> {removing === c.item_id ? 'Removing…' : 'Disconnect'}
                </button>
              </div>
            </div>
          );
        })}
      </Card>
    </section>
  );
}

function AccountRow({ a, onOpen }: { a: Account; onOpen: () => void }) {
  const liability = isLiability(a);
  const limit = a.type === 'credit' ? a.balances.limit : null;
  const used = a.balances.current ?? 0;
  const utilization = limit ? Math.min(used / limit, 1) : null;
  // Under 30% utilization is the usual guideline for keeping a healthy credit score
  const utilColor = utilization == null ? '' : utilization < 0.3 ? 'bg-green-500' : utilization < 0.5 ? 'bg-amber-500' : 'bg-red-500';
  const showAvailable = a.type === 'depository' && a.balances.available != null && a.balances.available !== a.balances.current;

  return (
    <button onClick={onOpen} className="w-full text-left block p-4 sm:p-5 hover:bg-sunken transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink truncate">{a.name}</p>
          <p className="text-xs text-muted font-medium mt-0.5 truncate">
            {a.institution}
            {a.subtype && <> · <span className="capitalize">{a.subtype.replace(/_/g, ' ')}</span></>}
            {a.mask && <> · ••{a.mask}</>}
          </p>
        </div>
        <div className="flex items-start gap-1 shrink-0">
          <div className="text-right">
            <Money value={a.balances.current} className={cn('font-bold text-lg', liability ? 'text-ink' : 'text-positive')} />
            {showAvailable && (
              <p className="text-xs text-muted font-medium"><Money value={a.balances.available} /> available</p>
            )}
          </div>
          <ChevronRight size={18} className="text-faint mt-1" />
        </div>
      </div>

      {utilization != null && limit != null && (
        <div className="mt-3">
          <div className="h-1.5 bg-sunken rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full', utilColor)} style={{ width: `${utilization * 100}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted font-medium mt-1.5">
            <span>{Math.round(utilization * 100)}% of limit used</span>
            <span><Money value={limit - used} whole /> available</span>
          </div>
        </div>
      )}
    </button>
  );
}
