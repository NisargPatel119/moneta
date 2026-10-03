'use client';
import { useState } from 'react';
import { Banknote, CreditCard, LineChart, Unlink, Wallet, type LucideIcon } from 'lucide-react';
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER, type Account, type DashboardData, isLiability } from '@/lib/finance';
import { Card, Money, cn } from './ui';

const TYPE_ICONS: Record<string, LucideIcon> = {
  depository: Wallet,
  credit: CreditCard,
  investment: LineChart,
  loan: Banknote,
};

export function Accounts({ data, onChanged }: { data: DashboardData; onChanged: () => void }) {
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
              {g.accounts.map(a => <AccountRow key={a.account_id} a={a} />)}
            </Card>
          </section>
        );
      })}

      <Connections data={data} onChanged={onChanged} />
    </div>
  );
}

// One row per linked institution (Plaid "Item"), with a way to disconnect it
function Connections({ data, onChanged }: { data: DashboardData; onChanged: () => void }) {
  const [removing, setRemoving] = useState<string | null>(null);
  const connections = [...new Map(data.accounts.map(a => [a.item_id, a])).values()].map(a => ({
    item_id: a.item_id,
    institution: a.institution,
    count: data.accounts.filter(x => x.item_id === a.item_id).length,
  }));
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
        {connections.map(c => (
          <div key={c.item_id} className="flex items-center justify-between gap-3 p-4 sm:p-5">
            <div>
              <p className="font-semibold text-ink">{c.institution}</p>
              <p className="text-xs text-muted font-medium">{c.count} account{c.count === 1 ? '' : 's'}</p>
            </div>
            <button
              onClick={() => remove(c.item_id, c.institution)}
              disabled={removing === c.item_id}
              className="flex items-center gap-1.5 text-sm font-semibold text-negative hover:bg-negative-soft px-3 py-2 rounded-xl disabled:opacity-50"
            >
              <Unlink size={16} /> {removing === c.item_id ? 'Removing…' : 'Disconnect'}
            </button>
          </div>
        ))}
      </Card>
    </section>
  );
}

function AccountRow({ a }: { a: Account }) {
  const liability = isLiability(a);
  const limit = a.type === 'credit' ? a.balances.limit : null;
  const used = a.balances.current ?? 0;
  const utilization = limit ? Math.min(used / limit, 1) : null;
  // Under 30% utilization is the usual guideline for keeping a healthy credit score
  const utilColor = utilization == null ? '' : utilization < 0.3 ? 'bg-green-500' : utilization < 0.5 ? 'bg-amber-500' : 'bg-red-500';
  const showAvailable = a.type === 'depository' && a.balances.available != null && a.balances.available !== a.balances.current;

  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink truncate">{a.name}</p>
          <p className="text-xs text-muted font-medium mt-0.5 truncate">
            {a.institution}
            {a.subtype && <> · <span className="capitalize">{a.subtype.replace(/_/g, ' ')}</span></>}
            {a.mask && <> · ••{a.mask}</>}
          </p>
        </div>
        <div className="text-right shrink-0">
          <Money value={a.balances.current} className={cn('font-bold text-lg', liability ? 'text-ink' : 'text-positive')} />
          {showAvailable && (
            <p className="text-xs text-muted font-medium"><Money value={a.balances.available} /> available</p>
          )}
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
    </div>
  );
}
