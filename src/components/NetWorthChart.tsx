'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dayKey, formatCompact, formatMoney, parseDay, type NetWorthBucket, type NetWorthPoint } from '@/lib/finance';
import type { NetWorthChange } from '@/lib/insights';
import { Money, cn, usePrivacy } from './ui';
import { NetWorthChangeBreakdown } from './NetWorthChange';

const RANGES = [
  { id: '1M', days: 31 },
  { id: '3M', days: 92 },
  { id: '1Y', days: 366 },
  { id: 'All', days: Infinity },
] as const;

const LINE = 'var(--accent)';

export function NetWorthChart({ history, current, explain, onBucket }: {
  history: NetWorthPoint[];
  current: number;
  /** Breaks the change since a day into cash, investments, debts… */
  explain?: (fromDay: string) => NetWorthChange | null;
  onBucket?: (bucket: NetWorthBucket) => void;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('1M');
  const [showWhy, setShowWhy] = useState(true);
  const { hidden } = usePrivacy();

  if (history.length < 2) {
    return (
      <p className="text-xs text-muted mt-4 bg-sunken rounded-xl p-3">
        Moneta records your net worth every day. Your chart will start filling in tomorrow.
      </p>
    );
  }

  const days = RANGES.find(r => r.id === range)!.days;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - (Number.isFinite(days) ? days : 0));
  const cutoff = Number.isFinite(days) ? dayKey(cutoffDate) : '';
  const points = history.filter(p => p.date >= cutoff);
  const first = points[0]?.netWorth ?? current;
  const change = current - first;
  const pct = first !== 0 ? change / Math.abs(first) : 0;

  const why = explain?.(points[0]?.date ?? cutoff);

  const data = points.map(p => ({
    label: parseDay(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    netWorth: p.netWorth,
  }));

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className={cn('text-sm font-semibold', change >= 0 ? 'text-positive' : 'text-negative')}>
          <Money value={change} signed whole /> ({change >= 0 ? '+' : '−'}{Math.abs(pct * 100).toFixed(1)}%)
          <span className="text-faint font-medium"> {range === 'All' ? 'all time' : `past ${range === '1M' ? 'month' : range === '3M' ? '3 months' : 'year'}`}</span>
        </p>
        <div className="inline-flex bg-sunken rounded-lg p-0.5 text-xs font-semibold">
          {RANGES.map(r => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={cn('px-2.5 py-1 rounded-md', range === r.id ? 'bg-surface text-ink' : 'text-muted')}
            >
              {r.id}
            </button>
          ))}
        </div>
      </div>
      <div className={cn('h-36 sm:h-44 mt-3 -mx-1', hidden && 'blur-md')}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={LINE} stopOpacity={0.18} />
                <stop offset="100%" stopColor={LINE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--faint)' }} axisLine={false} tickLine={false} minTickGap={40} />
            <YAxis hide domain={['dataMin', 'dataMax']} tickFormatter={formatCompact} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)', fontSize: 13 }}
              formatter={v => [formatMoney(Number(v)), 'Net worth']}
            />
            <Area type="monotone" dataKey="netWorth" stroke={LINE} strokeWidth={2} fill="url(#nw-fill)" activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {why && why.buckets.length > 0 && (
        <div className="mt-4 rounded-xl bg-sunken/60 p-3">
          <button onClick={() => setShowWhy(v => !v)} aria-expanded={showWhy} className="w-full flex items-center justify-between text-left">
            <span className="eyebrow text-muted">What changed</span>
            <ChevronDown size={16} className={cn('text-muted transition-transform', showWhy && 'rotate-180')} />
          </button>
          {showWhy && <div className="mt-3"><NetWorthChangeBreakdown change={why} onBucket={onBucket} /></div>}
        </div>
      )}
    </div>
  );
}
