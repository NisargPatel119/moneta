'use client';
import { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import {
  type DashboardData, isLiability, lastMonthSameDaySpending, monthRange, inRange,
  spendingByCategory, sumIncome, sumSpending,
} from '@/lib/finance';
import { Card, Money, SectionTitle, cn } from './ui';
import { TransactionList } from './TransactionList';

// Validated categorical slots (dataviz palette): blue, aqua, orange
const MIX_COLORS = { cash: '#2a78d6', investments: '#1baf7a', other: '#eb6834' };

export function Overview({ data, goTo, accountName }: {
  data: DashboardData;
  goTo: (tab: 'spending' | 'accounts' | 'investments', category?: string) => void;
  accountName: (id: string) => string | undefined;
}) {
  const stats = useMemo(() => {
    const thisMonth = data.transactions.filter(t => inRange(t, monthRange(0)));
    const spent = sumSpending(thisMonth);
    const lastPace = lastMonthSameDaySpending(data.transactions);
    const income = sumIncome(thisMonth);
    const categories = spendingByCategory(thisMonth).slice(0, 5);

    const mix = { cash: 0, investments: 0, other: 0 };
    for (const a of data.accounts) {
      if (isLiability(a)) continue;
      const bal = a.balances.current ?? 0;
      if (a.type === 'depository') mix.cash += bal;
      else if (a.type === 'investment') mix.investments += bal;
      else mix.other += bal;
    }
    // Same security across several accounts counts as one position
    const positions = new Map<string, { label: string; value: number }>();
    for (const h of data.holdings ?? []) {
      const p = positions.get(h.security_id) ?? { label: h.ticker ?? h.name, value: 0 };
      p.value += h.value;
      positions.set(h.security_id, p);
    }
    const holdingsTotal = [...positions.values()].reduce((s, p) => s + p.value, 0);
    const topHoldings = [...positions.values()].sort((a, b) => b.value - a.value).slice(0, 5);

    return { spent, lastPace, income, categories, mix, topHoldings, holdingsTotal };
  }, [data]);

  const paceDiff = stats.spent - stats.lastPace;
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });
  const mixEntries = ([
    ['cash', 'Cash'], ['investments', 'Investments'], ['other', 'Other'],
  ] as const).filter(([k]) => stats.mix[k] > 0);

  return (
    <div className="space-y-5">
      {/* Net worth hero */}
      <Card className="p-6 sm:p-8">
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Net worth</p>
        <Money value={data.netWorth} className="block text-4xl sm:text-5xl font-black tracking-tight text-slate-900 mt-2" />

        <div className="grid grid-cols-2 gap-3 mt-6">
          <button onClick={() => goTo('accounts')} className="text-left rounded-2xl bg-slate-50 p-4 hover:bg-slate-100 transition-colors">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <ArrowUpRight size={14} className="text-green-600" /> Assets
            </div>
            <Money value={data.assets} whole className="block text-xl sm:text-2xl font-bold text-slate-900 mt-1" />
          </button>
          <button onClick={() => goTo('accounts')} className="text-left rounded-2xl bg-slate-50 p-4 hover:bg-slate-100 transition-colors">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <ArrowDownRight size={14} className="text-red-600" /> Liabilities
            </div>
            <Money value={data.liabilities} whole className="block text-xl sm:text-2xl font-bold text-slate-900 mt-1" />
          </button>
        </div>

        {/* Asset mix */}
        {data.assets > 0 && (
          <div className="mt-6">
            <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5" role="img" aria-label="Asset mix">
              {mixEntries.map(([k, label]) => (
                <div key={k} title={label} style={{ width: `${(stats.mix[k] / data.assets) * 100}%`, backgroundColor: MIX_COLORS[k] }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
              {mixEntries.map(([k, label]) => (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: MIX_COLORS[k] }} />
                  <span className="text-slate-600 font-medium">{label}</span>
                  <Money value={stats.mix[k]} whole className="text-slate-900 font-semibold" />
                  <span className="text-slate-400 text-xs">{Math.round((stats.mix[k] / data.assets) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {stats.topHoldings.length > 0 && (
        <Card className="p-6">
          <SectionTitle action={
            <button onClick={() => goTo('investments')} className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 normal-case tracking-normal">
              All holdings <ChevronRight size={16} />
            </button>
          }>Top holdings</SectionTitle>
          <ul className="divide-y divide-slate-100">
            {stats.topHoldings.map(h => (
              <li key={h.label} className="flex items-center justify-between gap-3 py-2.5">
                <span className="font-semibold text-slate-900 truncate">{h.label}</span>
                <span className="flex items-baseline gap-2 shrink-0">
                  <Money value={h.value} whole className="font-semibold text-slate-900" />
                  <span className="text-xs text-slate-400 w-10 text-right">{((h.value / stats.holdingsTotal) * 100).toFixed(0)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* This month */}
        <Card className="p-6">
          <SectionTitle>{monthName} so far</SectionTitle>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500 font-medium">Spent</p>
              <Money value={stats.spent} className="block text-3xl font-bold text-slate-900" />
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500 font-medium">Income</p>
              <Money value={stats.income} className="block text-xl font-bold text-green-600" />
            </div>
          </div>
          {stats.lastPace > 0 && (
            <div className={cn(
              'mt-5 flex items-start gap-2 rounded-2xl p-3 text-sm font-medium',
              paceDiff > 0 ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'
            )}>
              {paceDiff > 0 ? <TrendingUp size={18} className="shrink-0" /> : <TrendingDown size={18} className="shrink-0" />}
              <span>
                <Money value={Math.abs(paceDiff)} whole className="font-bold" /> {paceDiff > 0 ? 'more' : 'less'} than
                this point last month (<Money value={stats.lastPace} whole />).
              </span>
            </div>
          )}
          <button onClick={() => goTo('spending')} className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
            View spending <ChevronRight size={16} />
          </button>
        </Card>

        {/* Top categories */}
        <Card className="p-6">
          <SectionTitle>Top categories this month</SectionTitle>
          {stats.categories.length === 0 ? (
            <p className="text-slate-500 text-sm py-6 text-center">No spending yet this month.</p>
          ) : (
            <ul className="space-y-1">
              {stats.categories.map(c => {
                const Icon = c.icon;
                return (
                  <li key={c.key}>
                    <button
                      onClick={() => goTo('spending', c.key)}
                      className="w-full flex items-center gap-3 rounded-xl p-2 -mx-2 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${c.color}1a`, color: c.color }}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold text-slate-800 truncate">{c.label}</span>
                          <Money value={c.total} whole className="font-semibold text-slate-900" />
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                          <div className="h-full bg-blue-600 rounded-full" style={{ width: `${(c.total / stats.spent) * 100}%` }} />
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="overflow-hidden">
        <div className="px-5 pt-5">
          <SectionTitle action={
            <button onClick={() => goTo('spending')} className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 normal-case tracking-normal">
              See all <ChevronRight size={16} />
            </button>
          }>Recent activity</SectionTitle>
        </div>
        <TransactionList transactions={data.transactions.slice(0, 6)} accountName={accountName} />
      </Card>
    </div>
  );
}
