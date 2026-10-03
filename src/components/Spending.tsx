'use client';
import { useMemo, useState } from 'react';
import { ArrowLeftRight, Search, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER, type DashboardData, categoryMeta, dayKey,
  displayName, formatCompact, formatMoney, inRange, monthRange, parseDay, spendingByCategory,
  sumIncome, sumSpending,
} from '@/lib/finance';
import type { TxnRules } from '@/lib/transfers';
import { Card, Money, SectionTitle, cn, usePrivacy } from './ui';
import { TransactionList } from './TransactionList';

type Period = 'this' | 'last' | '90';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'this', label: 'This month' },
  { id: 'last', label: 'Last month' },
  { id: '90', label: 'Last 90 days' },
];

const THIS_MONTH = '#2a78d6';
const LAST_MONTH = '#94a3b8';

function periodRange(p: Period) {
  if (p === 'this') return monthRange(0);
  if (p === 'last') return monthRange(-1);
  const start = new Date();
  start.setDate(start.getDate() - 90);
  return { start: dayKey(start), end: dayKey(new Date()) };
}

export function Spending({ data, rules, accountName, category, setCategory, onOpenTransfers }: {
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
      out.push({ label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), spend: totals.get(key) ?? 0 });
    }
    return out;
  }, [periodTxns, period, range.start, range.end, rules]);

  const groupedAccounts = ACCOUNT_TYPE_ORDER
    .map(type => ({ type, accounts: data.accounts.filter(a => (a.type ?? 'other') === type) }))
    .filter(g => g.accounts.length > 0);

  const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)', fontSize: 13 };
  const axisTick = { fontSize: 12, fill: '#64748b' };

  return (
    <div className="space-y-5">
      {/* Filters: one row above everything they control */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="inline-flex bg-slate-200/60 rounded-xl p-1 self-start">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap',
                period === p.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
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
          className="flex-1 min-w-0 sm:flex-none sm:max-w-xs truncate bg-white border border-slate-300 text-slate-900 text-sm rounded-xl p-2.5 font-medium shadow-sm outline-none focus:ring-2 focus:ring-blue-500"
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
          className="shrink-0 flex items-center gap-1.5 bg-white border border-slate-300 text-slate-700 text-sm rounded-xl px-3 font-semibold shadow-sm hover:bg-slate-50"
        >
          <ArrowLeftRight size={16} /> Transfers
        </button>
        </div>
      </div>

      {period === 'this' && periodTxns.length === 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-blue-50 border border-blue-100 p-4 text-sm font-medium text-blue-900">
          <span>No transactions yet this month. Banks can take a day or two to post new ones.</span>
          <button onClick={() => setPeriod('last')} className="shrink-0 font-semibold text-blue-700 underline">See last month</button>
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Spent</p>
          <Money value={spent} whole className="block text-lg sm:text-2xl font-bold text-slate-900 mt-1" />
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Income</p>
          <Money value={income} whole className="block text-lg sm:text-2xl font-bold text-green-600 mt-1" />
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Net</p>
          <Money value={income - spent} whole className={cn('block text-lg sm:text-2xl font-bold mt-1', income - spent >= 0 ? 'text-green-600' : 'text-slate-900')} />
        </Card>
      </div>

      {/* Chart */}
      <Card className="p-5 sm:p-6">
        {period === 'this' ? (
          <>
            <SectionTitle>Spending pace</SectionTitle>
            <div className="flex gap-5 text-sm mb-3">
              <span className="flex items-center gap-2 font-medium text-slate-700"><span className="w-4 h-0.5 rounded" style={{ backgroundColor: THIS_MONTH }} />This month</span>
              <span className="flex items-center gap-2 font-medium text-slate-700"><span className="w-4 h-0.5 rounded" style={{ backgroundColor: LAST_MONTH }} />Last month</span>
            </div>
          </>
        ) : (
          <SectionTitle>Daily spending</SectionTitle>
        )}
        <div className={cn('h-56 sm:h-64 w-full', hidden && 'blur-md')}>
          <ResponsiveContainer width="100%" height="100%">
            {period === 'this' ? (
              <LineChart data={paceData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tickFormatter={formatCompact} tick={axisTick} axisLine={false} tickLine={false} width={56} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={d => `Day ${d}`}
                  formatter={(v, name) => [formatMoney(Number(v)), name === 'thisMonth' ? 'This month' : 'Last month']}
                />
                <Line type="monotone" dataKey="lastMonth" stroke={LAST_MONTH} strokeWidth={2} dot={false} strokeDasharray="4 4" connectNulls={false} />
                <Line type="monotone" dataKey="thisMonth" stroke={THIS_MONTH} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} connectNulls={false} />
              </LineChart>
            ) : (
              <BarChart data={dailyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tickFormatter={formatCompact} tick={axisTick} axisLine={false} tickLine={false} width={56} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={v => [formatMoney(Number(v)), 'Spent']} />
                <Bar dataKey="spend" fill={THIS_MONTH} radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
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
                    className={cn('w-full flex items-center gap-3 rounded-xl p-2 -mx-2 text-left transition-colors', active ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50')}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${c.color}1a`, color: c.color }}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm gap-2">
                        <span className="font-semibold text-slate-800 truncate">{c.label}</span>
                        <span className="shrink-0">
                          <Money value={c.total} whole className="font-semibold text-slate-900" />
                          <span className="text-slate-400 text-xs ml-1.5">{Math.round((c.total / spent) * 100)}%</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${(c.total / categories[0].total) * 100}%` }} />
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-slate-400 mt-3">Tap a category to filter transactions. Transfers aren&apos;t counted as spending unless you turn that on in{' '}
            <button onClick={onOpenTransfers} className="underline font-semibold">Transfers</button>.</p>
        </Card>
      )}

      {/* Transactions */}
      <Card className="overflow-hidden">
        <div className="p-4 sm:p-5 space-y-3 border-b border-slate-100">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search transactions"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-base sm:text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-slate-500 font-medium">
              {visibleTxns.length} transaction{visibleTxns.length === 1 ? '' : 's'}
            </p>
            {hiddenCount > 0 && !showHidden && (
              <button onClick={() => setShowHidden(true)} className="text-xs font-semibold text-slate-500 hover:text-slate-900">
                {hiddenCount} hidden transfer{hiddenCount === 1 ? '' : 's'} · Show
              </button>
            )}
            {showHidden && !category && (
              <button onClick={() => setShowHidden(false)} className="text-xs font-semibold text-slate-500 hover:text-slate-900">
                Hide transfers
              </button>
            )}
            {category && (
              <button
                onClick={() => setCategory(null)}
                className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full hover:bg-blue-100"
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
            emptyText={query || category ? 'No transactions match your filters.' : 'No transactions in this period.'}
          />
        </div>
      </Card>
    </div>
  );
}
