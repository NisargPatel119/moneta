'use client';
import { Banknote, CreditCard, LineChart, Wallet, type LucideIcon } from 'lucide-react';
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER, type Account, type DashboardData, isLiability } from '@/lib/finance';
import { Card, Money, cn } from './ui';

const TYPE_ICONS: Record<string, LucideIcon> = {
  depository: Wallet,
  credit: CreditCard,
  investment: LineChart,
  loan: Banknote,
};

export function Accounts({ data }: { data: DashboardData }) {
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
                <Icon size={18} className="text-blue-600" />
                <h3 className="font-bold text-slate-800">{ACCOUNT_TYPE_LABELS[g.type] ?? g.type}</h3>
                <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{g.accounts.length}</span>
              </div>
              <div className="text-right">
                <Money value={g.total} className={cn('font-bold', owed ? 'text-slate-900' : 'text-green-600')} />
                {owed && <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">owed</p>}
              </div>
            </div>
            <Card className="divide-y divide-slate-100 overflow-hidden">
              {g.accounts.map(a => <AccountRow key={a.account_id} a={a} />)}
            </Card>
          </section>
        );
      })}
    </div>
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
          <p className="font-semibold text-slate-900 truncate">{a.name}</p>
          <p className="text-xs text-slate-500 font-medium mt-0.5 truncate">
            {a.institution}
            {a.subtype && <> · <span className="capitalize">{a.subtype.replace(/_/g, ' ')}</span></>}
            {a.mask && <> · ••{a.mask}</>}
          </p>
        </div>
        <div className="text-right shrink-0">
          <Money value={a.balances.current} className={cn('font-bold text-lg', liability ? 'text-slate-900' : 'text-green-600')} />
          {showAvailable && (
            <p className="text-xs text-slate-500 font-medium"><Money value={a.balances.available} /> available</p>
          )}
        </div>
      </div>

      {utilization != null && limit != null && (
        <div className="mt-3">
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full', utilColor)} style={{ width: `${utilization * 100}%` }} />
          </div>
          <div className="flex justify-between text-xs text-slate-500 font-medium mt-1.5">
            <span>{Math.round(utilization * 100)}% of limit used</span>
            <span><Money value={limit - used} whole /> available</span>
          </div>
        </div>
      )}
    </div>
  );
}
