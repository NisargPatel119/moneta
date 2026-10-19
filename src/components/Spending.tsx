'use client';
import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER, type DashboardData, categoryMeta, dayKey,
  type Txn, displayName, formatCompact, formatMoney, inRange, monthRange, parseDay, spendingByCategory,
  sumIncome, sumSpending, isIncome,
} from '@/lib/finance';
import { dayDrill, type Drill } from './DrillSheet';
import type { TxnRules } from '@/lib/transfers';
import { Card, Money, SectionTitle, cn, usePrivacy, tint } from './ui';
import { TransactionList } from './TransactionList';

type Period = 'this' | 'last' | '90';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'this', label: 'This month' },
  { id: 'last', label: 'Last month' },
  { id: '90', label: 'Last 90 days' },
];

const THIS_MONTH = 'var(--accent)';
const LAST_MONTH = 'var(--faint)';

function periodRange(p: Period) {
  if (p === 'this') return monthRange(0);
  if (p === 'last') return monthRange(-1);
  const start = new Date();
  start.setDate(start.getDate() - 90);
  return { start: dayKey(start), end: dayKey(new Date()) };
}

export function Spending({ data, rules, accountName, category, setCategory, onOpenTransfers, onSelect, onDrill }: {
  onSelect: (t: Txn) => void;
  onDrill: (d: Drill) => void;
  data: DashboardData;
  rules: TxnRules;
  accountName: (id: string) => string | undefined;
  category: string | null;
  setCategory: (c: string | null) => void;
  onOpenTransfers: () => void;
}) {
  const [period, setPeriod] = useState<Period>('this');
  const [accountId, setAccountId] = useState('all');
  const [query, setQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const { hidden } = usePrivacy();

  const range = periodRange(period);

  // Transactions in the period, for the selected account (category/search applied separately below)
  const periodTxns = useMemo(() => data.transactions.filter(t =>
    inRange(t, range) && (accountId === 'all' || t.account_id === accountId)
  ), [data, range.start, range.end, accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const spent = sumSpending(periodTxns, rules);
  const income = sumIncome(periodTxns);
  const categories = spendingByCategory(periodTxns, rules);

  const { visibleTxns, hiddenCount } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = periodTxns.filter(t =>
      // Picking a category shows its transactions even if that transfer type is hidden
      (!category || rules.groupKey(t) === category) &&
      (!q || displayName(t).toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
    );
    const hiddenTxns = category ? [] : matching.filter(t => rules.isHidden(t));
    return {
      visibleTxns: showHidden || category ? matching : matching.filter(t => !rules.isHidden(t)),
      hiddenCount: hiddenTxns.length,
    };
  }, [periodTxns, category, query, rules, showHidden]);

  // "This month" chart: cumulative spend by day-of-month vs last month
  const paceData = useMemo(() => {
    if (period !== 'this') return [];
    const accountTxns = data.transactions.filter(t => accountId === 'all' || t.account_id === accountId);
    const cumulative = (r: { start: string; end: string }, upTo: number) => {
      const daily = new Array(32).fill(0);
      for (const t of accountTxns) if (inRange(t, r) && rules.isSpending(t)) daily[parseDay(t.date).getDate()] += t.amount;
      const out: (number | null)[] = [];
      let running = 0;
      for (let d = 1; d <= 31; d++) { running += daily[d]; out.push(d <= upTo ? running : null); }
      return out;
    };
    const today = new Date().getDate();
    const lastRange = monthRange(-1);
    const daysLast = parseDay(lastRange.end).getDate();
    const daysThis = parseDay(monthRange(0).end).getDate();
    const thisM = cumulative(monthRange(0), today);
    const lastM = cumulative(lastRange, daysLast);
    return Array.from({ length: daysThis }, (_, i) => ({ day: i + 1, thisMonth: thisM[i], lastMonth: lastM[i] }));
  }, [data, period, accountId, rules]);

  // Other periods: daily spending bars
  const dailyData = useMemo(() => {
    if (period === 'this') return [];
    const totals = new Map<string, number>();
    for (const t of periodTxns) if (rules.isSpending(t)) totals.set(t.date, (totals.get(t.date) ?? 0) + t.amount);
    const out = [];
    for (let d = parseDay(range.start); dayKey(d) <= range.end; d.setDate(d.getDate() + 1)) {
      const key = dayKey(d);
      out.push({ day: key, label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), spend: totals.get(key) ?? 0 });
    }
    return out;
  }, [periodTxns, period, range.start, range.end, rules]);

  const groupedAccounts = ACCOUNT_TYPE_ORDER
    .map(type => ({ type, accounts: data.accounts.filter(a => (a.type ?? 'other') === type) }))
    .filter(g => g.accounts.length > 0);

  const periodLabel = PERIODS.find(p => p.id === period)!.label;
  const totalsDrill = (title: string, txns: Txn[], total: 'spending' | 'income' | 'flow') =>
    onDrill({ kind: 'txns', title, subtitle: periodLabel, txns, total });

  // Tapping a day on either chart lists what was spent that day
  const openDay = (index: unknown, days: (string | null)[]) => {
    const day = days[Number(index)];
    if (day) onDrill(dayDrill(day, data.transactions, rules, accountId));
  };
  const thisMonthStart = monthRange(0).start;
  const today = dayKey(new Date());
  const paceDays = paceData.map(p => {
    const day = `${thisMonthStart.slice(0, 8)}${String(p.day).padStart(2, '0')}`;
    return day <= today ? day : null;
  });

  const tooltipStyle = { borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)', fontSize: 13 };
  const axisTick = { fontSize: 12, fill: 'var(--muted)' };

  return (
    <div className="space-y-5">
      {/* Filters: one row above everything they control */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="inline-flex bg-sunken rounded-xl p-1 self-start">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap',
                period === p.id ? 'bg-surface text-ink' : 'text-muted hover:text-ink'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 min-w-0">
        <select
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
          className="flex-1 min-w-0 sm:flex-none sm:max-w-xs truncate bg-surface border border-line-strong text-ink text-sm rounded-xl p-2.5 font-medium outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="all">All accounts</option>
          {groupedAccounts.map(g => (
            <optgroup key={g.type} label={ACCOUNT_TYPE_LABELS[g.type] ?? g.type}>
              {g.accounts.map(a => (
                <option key={a.account_id} value={a.account_id}>{a.name}{a.mask ? ` ••${a.mask}` : ''}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          onClick={onOpenTransfers}
          className="shrink-0 flex items-center gap-1.5 bg-surface border border-line-strong text-ink-2 text-sm rounded-xl px-3 font-semibold hover:bg-sunken"
        >
          <SlidersHorizontal size={16} /> Rules
        </button>
        </div>
      </div>

      {period === 'this' && periodTxns.length === 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-accent-soft border border-accent/20 p-4 text-sm font-medium text-accent">
          <span>No transactions yet this month. Banks can take a day or two to post new ones.</span>
          <button onClick={() => setPeriod('last')} className="shrink-0 font-semibold text-accent underline">See last month</button>
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => totalsDrill('Spending', periodTxns.filter(t => rules.isSpending(t)), 'spending')} className="text-left bg-surface rounded-2xl border border-line p-4 sm:p-5 hover:bg-sunken transition-colors">
          <p className="eyebrow text-muted">Spent</p>
          <Money value={spent} whole className="block text-3xl sm:text-4xl font-display font-normal tracking-tight leading-none text-ink mt-2" />
        </button>
        <button onClick={() => totalsDrill('Income', periodTxns.filter(isIncome), 'income')} className="text-left bg-surface rounded-2xl border border-line p-4 sm:p-5 hover:bg-sunken transition-colors">
          <p className="eyebrow text-muted">Income</p>
          <Money value={income} whole className="block text-3xl sm:text-4xl font-display font-normal tracking-tight leading-none text-positive mt-2" />
        </button>
        <button onClick={() => totalsDrill('Income & spending', periodTxns.filter(t => isIncome(t) || rules.isSpending(t)), 'flow')} className="text-left bg-surface rounded-2xl border border-line p-4 sm:p-5 hover:bg-sunken transition-colors">
          <p className="eyebrow text-muted">Net</p>
          <Money value={income - spent} whole className={cn('block text-3xl sm:text-4xl font-display font-normal tracking-tight leading-none mt-2', income - spent >= 0 ? 'text-positive' : 'text-ink')} />
        </button>
      </div>

      {/* Chart */}
      <Card className="p-5 sm:p-6">
        {period === 'this' ? (
          <>
            <SectionTitle>Spending pace</SectionTitle>
            <div className="flex gap-5 text-sm mb-3">
              <span className="flex items-center gap-2 font-medium text-ink-2"><span className="w-4 h-0.5 rounded" style={{ backgroundColor: THIS_MONTH }} />This month</span>
              <span className="flex items-center gap-2 font-medium text-ink-2"><span className="w-4 h-0.5 rounded" style={{ backgroundColor: LAST_MONTH }} />Last month</span>
            </div>
          </>
        ) : (
          <SectionTitle>Daily spending</SectionTitle>
        )}
        <div className={cn('h-56 sm:h-64 w-full', hidden && 'blur-md')}>
          <ResponsiveContainer width="100%" height="100%">
            {period === 'this' ? (
              <LineChart data={paceData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={e => openDay(e?.activeIndex, paceDays)} style={{ cursor: 'pointer' }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tickFormatter={formatCompact} tick={axisTick} axisLine={false} tickLine={false} width={56} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={d => `Day ${d}`}
                  formatter={(v, name) => [formatMoney(Number(v)), name === 'thisMonth' ? 'This month' : 'Last month']}
                />
                <Line type="monotone" dataKey="lastMonth" stroke={LAST_MONTH} strokeWidth={2} dot={false} strokeDasharray="4 4" connectNulls={false} />
                <Line type="monotone" dataKey="thisMonth" stroke={THIS_MONTH} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }} connectNulls={false} />
              </LineChart>
            ) : (
              <BarChart data={dailyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={e => openDay(e?.activeIndex, dailyData.map(d => d.day))} style={{ cursor: 'pointer' }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tickFormatter={formatCompact} tick={axisTick} axisLine={false} tickLine={false} width={56} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--sunken)' }} formatter={v => [formatMoney(Number(v)), 'Spent']} />
                <Bar dataKey="spend" fill={THIS_MONTH} radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-faint mt-2">Tap a day to see what you spent.</p>
      </Card>

      {/* Categories */}
      {categories.length > 0 && (
        <Card className="p-5 sm:p-6">
          <SectionTitle>By category</SectionTitle>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
            {categories.map(c => {
              const Icon = c.icon;
              const active = category === c.key;
              return (
                <li key={c.key}>
                  <button
                    onClick={() => setCategory(active ? null : c.key)}
                    className={cn('w-full flex items-center gap-3 rounded-xl p-2 -mx-2 text-left transition-colors', active ? 'bg-accent-soft ring-1 ring-accent/30' : 'hover:bg-sunken')}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: tint(c.color), color: c.color }}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm gap-2">
                        <span className="font-semibold text-ink truncate">{c.label}</span>
                        <span className="shrink-0">
                          <Money value={c.total} whole className="font-semibold text-ink" />
                          <span className="text-faint text-xs ml-1.5">{Math.round((c.total / spent) * 100)}%</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-sunken rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full bg-accent rounded-full" style={{ width: `${(c.total / categories[0].total) * 100}%` }} />
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-faint mt-3">Tap a category to filter transactions. Transfers aren&apos;t counted as spending unless you turn that on in{' '}
            <button onClick={onOpenTransfers} className="underline font-semibold">Rules</button>. Tap a transaction to recategorize it.</p>
        </Card>
      )}

      {/* Transactions */}
      <Card className="overflow-hidden">
        <div className="p-4 sm:p-5 space-y-3 border-b border-line">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search transactions"
              className="w-full bg-sunken border border-line rounded-xl pl-10 pr-3 py-2.5 text-base sm:text-sm font-medium outline-none focus:ring-2 focus:ring-accent focus:bg-surface"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted font-medium">
              {visibleTxns.length} transaction{visibleTxns.length === 1 ? '' : 's'}
            </p>
            {hiddenCount > 0 && !showHidden && (
              <button onClick={() => setShowHidden(true)} className="text-xs font-semibold text-muted hover:text-ink">
                {hiddenCount} hidden transfer{hiddenCount === 1 ? '' : 's'} · Show
              </button>
            )}
            {showHidden && !category && (
              <button onClick={() => setShowHidden(false)} className="text-xs font-semibold text-muted hover:text-ink">
                Hide transfers
              </button>
            )}
            {category && (
              <button
                onClick={() => setCategory(null)}
                className="flex items-center gap-1 bg-accent-soft text-accent text-xs font-bold px-2.5 py-1 rounded-full hover:bg-accent-soft"
              >
                {categoryMeta(category).label} <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          <TransactionList
            transactions={visibleTxns}
            rules={rules}
            accountName={accountId === 'all' ? accountName : undefined}
            onSelect={onSelect}
            emptyText={query || category ? 'No transactions match your filters.' : 'No transactions in this period.'}
          />
        </div>
      </Card>
    </div>
  );
}
