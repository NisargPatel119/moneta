'use client';
import { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarClock, ChevronRight, Inbox, TrendingDown, TrendingUp } from 'lucide-react';
import {
  type DashboardData, type NetWorthBucket, type Txn, dayKey, friendlyDay, isIncome, isLiability, lastMonthSameDaySpending,
  monthRange, inRange, spendingByCategory, sumIncome, sumSpending,
} from '@/lib/finance';
import { netWorthChange, type MonthlyRecap } from '@/lib/insights';
import { Card, DrillButton, Money, SectionTitle, cn, tint } from './ui';
import type { Drill } from './DrillSheet';
import { RecapCard } from './MonthlyRecap';
import { ForecastCard } from './Forecast';
import { TransactionList } from './TransactionList';
import type { TxnRules } from '@/lib/transfers';
import { projectOccurrences, type RecurringItem } from '@/lib/recurring';
import { NetWorthChart } from './NetWorthChart';

// Validated categorical slots (dataviz palette): blue, aqua, orange
const MIX_COLORS = { cash: 'var(--series-1)', investments: 'var(--series-3)', other: 'var(--series-2)' };

export function Overview({ data, rules, recurring, goTo, onOpenRecurring, onSelect, accountName, onDrill, recap, onOpenRecap, reviewCount, onOpenReview, onOpenForecast }: {
  recurring: RecurringItem[];
  onOpenRecurring: () => void;
  onSelect: (t: Txn) => void;
  data: DashboardData;
  rules: TxnRules;
  goTo: (tab: 'spending' | 'accounts' | 'investments', category?: string) => void;
  accountName: (id: string) => string | undefined;
  onDrill: (d: Drill) => void;
  /** Last month's recap (null without enough data) */
  recap: MonthlyRecap | null;
  onOpenRecap: () => void;
  reviewCount: number;
  onOpenReview: () => void;
  onOpenForecast: () => void;
}) {
  const stats = useMemo(() => {
    const thisMonth = data.transactions.filter(t => inRange(t, monthRange(0)));
    const spent = sumSpending(thisMonth, rules);
    const lastPace = lastMonthSameDaySpending(data.transactions, rules);
    const income = sumIncome(thisMonth);
    const categories = spendingByCategory(thisMonth, rules).slice(0, 5);

    const mix = { cash: 0, investments: 0, other: 0 };
    for (const a of data.accounts) {
      if (isLiability(a)) continue;
      const bal = a.balances.current ?? 0;
      if (a.type === 'depository') mix.cash += bal;
      else if (a.type === 'investment') mix.investments += bal;
      else mix.other += bal;
    }
    // A home, car, or anything else entered by hand
    for (const a of data.manualAssets ?? []) mix.other += a.value;
    // Same security across several accounts counts as one position
    const positions = new Map<string, { label: string; value: number }>();
    for (const h of data.holdings ?? []) {
      const p = positions.get(h.security_id) ?? { label: h.ticker ?? h.name, value: 0 };
      p.value += h.value;
      positions.set(h.security_id, p);
    }
    const holdingsTotal = [...positions.values()].reduce((s, p) => s + p.value, 0);
    const topHoldings = [...positions.values()].sort((a, b) => b.value - a.value).slice(0, 5);

    return { spent, lastPace, income, categories, mix, topHoldings, holdingsTotal, thisMonth };
  }, [data, rules]);

  const thisMonthDrill = (title: string, kind: 'spending' | 'income'): Drill => ({
    kind: 'txns',
    title,
    subtitle: `${monthName} so far`,
    txns: stats.thisMonth.filter(t => (kind === 'income' ? isIncome(t) : rules.isSpending(t))),
    total: kind,
  });

  // Net worth buckets map to tabs: debts and property live under Accounts
  const openBucket = (bucket: NetWorthBucket) => goTo(bucket === 'investments' ? 'investments' : 'accounts');

  const paceDiff = stats.spent - stats.lastPace;
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });
  const mixEntries = ([
    ['cash', 'Cash'], ['investments', 'Investments'], ['other', 'Property & other'],
  ] as const).filter(([k]) => stats.mix[k] > 0);

  return (
    <div className="space-y-5">
      {reviewCount > 0 && (
        <button
          onClick={onOpenReview}
          className="w-full flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-4 text-left hover:brightness-[0.98]"
        >
          <span className="w-10 h-10 rounded-xl bg-accent text-on-accent flex items-center justify-center shrink-0"><Inbox size={18} /></span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-ink">{reviewCount} new transaction{reviewCount === 1 ? '' : 's'} to review</span>
            <span className="block text-xs text-muted mt-0.5">A quick look keeps your categories and totals right</span>
          </span>
          <ChevronRight size={18} className="text-accent shrink-0" />
        </button>
      )}

      {/* Net worth hero */}
      <Card className="p-6 sm:p-8">
        <p className="text-muted eyebrow">Net worth</p>
        <Money value={data.netWorth} className="block font-display text-5xl sm:text-6xl tracking-tight text-ink mt-2 leading-none" />
        <NetWorthChart
          history={data.history ?? []}
          current={data.netWorth}
          explain={fromDay => netWorthChange(data.history ?? [], fromDay, dayKey(new Date()), data.transactions, rules)}
          onBucket={openBucket}
        />

        <div className="grid grid-cols-2 gap-3 mt-6">
          <button onClick={() => goTo('accounts')} className="text-left rounded-2xl bg-sunken p-4 hover:bg-sunken transition-colors">
            <div className="flex items-center gap-1.5 eyebrow text-muted">
              <ArrowUpRight size={14} className="text-positive" /> Assets
            </div>
            <Money value={data.assets} whole className="block text-3xl sm:text-4xl font-display font-normal tracking-tight leading-none text-ink mt-2" />
          </button>
          <button onClick={() => goTo('accounts')} className="text-left rounded-2xl bg-sunken p-4 hover:bg-sunken transition-colors">
            <div className="flex items-center gap-1.5 eyebrow text-muted">
              <ArrowDownRight size={14} className="text-negative" /> Liabilities
            </div>
            <Money value={data.liabilities} whole className="block text-3xl sm:text-4xl font-display font-normal tracking-tight leading-none text-ink mt-2" />
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
                  <span className="text-muted font-medium">{label}</span>
                  <Money value={stats.mix[k]} whole className="text-ink font-semibold" />
                  <span className="text-faint text-xs">{Math.round((stats.mix[k] / data.assets) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <ForecastCard data={data} rules={rules} onOpen={onOpenForecast} />

      {recap && <RecapCard recap={recap} onOpen={onOpenRecap} />}

      <UpcomingCard recurring={recurring} onOpen={onOpenRecurring} onItem={item => onDrill({ kind: 'merchant', key: item.key, name: item.name })} />

      {stats.topHoldings.length > 0 && (
        <Card className="p-6">
          <SectionTitle action={
            <button onClick={() => goTo('investments')} className="text-sm font-semibold text-accent hover:text-accent flex items-center gap-0.5 normal-case tracking-normal">
              All holdings <ChevronRight size={16} />
            </button>
          }>Top holdings</SectionTitle>
          <ul className="divide-y divide-line">
            {stats.topHoldings.map(h => (
              <li key={h.label} className="flex items-center justify-between gap-3 py-2.5">
                <span className="font-semibold text-ink truncate">{h.label}</span>
                <span className="flex items-baseline gap-2 shrink-0">
                  <Money value={h.value} whole className="font-semibold text-ink" />
                  <span className="text-xs text-faint w-10 text-right">{((h.value / stats.holdingsTotal) * 100).toFixed(0)}%</span>
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
            <DrillButton onClick={() => onDrill(thisMonthDrill('Spending', 'spending'))} label="See this month's spending">
              <p className="text-sm text-muted font-medium">Spent</p>
              <Money value={stats.spent} className="block text-4xl font-display font-normal tracking-tight text-ink" />
            </DrillButton>
            <DrillButton onClick={() => onDrill(thisMonthDrill('Income', 'income'))} className="text-right" label="See this month's income">
              <p className="text-sm text-muted font-medium">Income</p>
              <Money value={stats.income} className="block text-3xl font-display font-normal tracking-tight leading-none text-positive" />
            </DrillButton>
          </div>
          {stats.lastPace > 0 && (
            <div className={cn(
              'mt-5 flex items-start gap-2 rounded-2xl p-3 text-sm font-medium',
              paceDiff > 0 ? 'bg-warn-soft text-warn' : 'bg-positive-soft text-positive'
            )}>
              {paceDiff > 0 ? <TrendingUp size={18} className="shrink-0" /> : <TrendingDown size={18} className="shrink-0" />}
              <span>
                <Money value={Math.abs(paceDiff)} whole className="font-bold" /> {paceDiff > 0 ? 'more' : 'less'} than
                this point last month (<Money value={stats.lastPace} whole />).
              </span>
            </div>
          )}
          <button onClick={() => goTo('spending')} className="mt-4 text-sm font-semibold text-accent hover:text-accent flex items-center gap-1">
            View spending <ChevronRight size={16} />
          </button>
        </Card>

        {/* Top categories */}
        <Card className="p-6">
          <SectionTitle>Top categories this month</SectionTitle>
          {stats.categories.length === 0 ? (
            <p className="text-muted text-sm py-6 text-center">No spending yet this month.</p>
          ) : (
            <ul className="space-y-1">
              {stats.categories.map(c => {
                const Icon = c.icon;
                return (
                  <li key={c.key}>
                    <button
                      onClick={() => goTo('spending', c.key)}
                      className="w-full flex items-center gap-3 rounded-xl p-2 -mx-2 hover:bg-sunken transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: tint(c.color), color: c.color }}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold text-ink truncate">{c.label}</span>
                          <Money value={c.total} whole className="font-semibold text-ink" />
                        </div>
                        <div className="h-1.5 bg-sunken rounded-full mt-1.5 overflow-hidden">
                          <div className="h-full bg-accent rounded-full" style={{ width: `${(c.total / stats.spent) * 100}%` }} />
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
            <button onClick={() => goTo('spending')} className="text-sm font-semibold text-accent hover:text-accent flex items-center gap-0.5 normal-case tracking-normal">
              See all <ChevronRight size={16} />
            </button>
          }>Recent activity</SectionTitle>
        </div>
        <TransactionList transactions={data.transactions.filter(t => !rules.isHidden(t)).slice(0, 6)} rules={rules} accountName={accountName} onSelect={onSelect} />
      </Card>
    </div>
  );
}

// Bills, subscriptions and paychecks expected in the next two weeks
function UpcomingCard({ recurring, onOpen, onItem }: { recurring: RecurringItem[]; onOpen: () => void; onItem: (item: RecurringItem) => void }) {
  const start = dayKey(new Date());
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 14);
  const end = dayKey(endDate);
  const upcoming = projectOccurrences(recurring, start, end).filter(o => o.date >= start);
  if (upcoming.length === 0) return null;
  const totalOut = upcoming.filter(o => o.item.kind !== 'income').reduce((s, o) => s + o.item.amount, 0);

  return (
    <Card className="p-6">
      <SectionTitle action={
        <button onClick={onOpen} className="text-sm font-semibold text-accent hover:text-accent flex items-center gap-0.5 normal-case tracking-normal">
          All recurring <ChevronRight size={16} />
        </button>
      }>Next 2 weeks</SectionTitle>
      <p className="text-sm text-muted mb-2 flex items-center gap-1.5">
        <CalendarClock size={15} className="text-accent" />
        <Money value={totalOut} whole className="font-semibold text-ink" /> in bills & subscriptions coming up
      </p>
      <ul className="divide-y divide-line">
        {upcoming.slice(0, 6).map(o => (
          <li key={`${o.item.key}-${o.date}`}>
            <button onClick={() => onItem(o.item)} className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:bg-sunken -mx-2 px-2 rounded-lg">
              <div className="min-w-0">
                <p className="font-semibold text-ink truncate">{o.item.name}</p>
                <p className="text-xs text-muted">{friendlyDay(o.date)}</p>
              </div>
              <span className={cn('font-semibold shrink-0', o.item.kind === 'income' ? 'text-positive' : 'text-ink')}>
                {o.item.variable && <span className="text-faint font-medium">~</span>}
                <Money value={o.item.kind === 'income' ? o.item.amount : -o.item.amount} signed />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
