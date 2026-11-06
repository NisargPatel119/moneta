'use client';
import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  type Account, type HoldingRow, type InvestmentHistory, type SecurityPoint, SECURITY_TYPE_LABELS, dayKey, formatCompact,
  formatMoney, isRetirementAccount, parseDay,
} from '@/lib/finance';
import { Card, Money, Sheet, cn, usePref, usePrivacy } from './ui';

// ---------- Filters ----------

export type InvestmentFilters = {
  /** Empty = all */
  accounts: string[];
  institutions: string[];
  types: string[];
  kind: 'all' | 'taxable' | 'retirement';
};

const NO_FILTERS: InvestmentFilters = { accounts: [], institutions: [], types: [], kind: 'all' };
const FILTERS_KEY = 'ws_investment_filters';

// Filters are remembered per device
export function useInvestmentFilters(): [InvestmentFilters, (f: InvestmentFilters) => void] {
  const [saved, setSaved] = usePref(FILTERS_KEY);
  const filters = useMemo<InvestmentFilters>(() => {
    try { return { ...NO_FILTERS, ...(saved ? JSON.parse(saved) : {}) }; } catch { return NO_FILTERS; }
  }, [saved]);
  return [filters, f => setSaved(JSON.stringify(f))];
}

export function activeFilterCount(f: InvestmentFilters) {
  return f.accounts.length + f.institutions.length + f.types.length + (f.kind === 'all' ? 0 : 1);
}

// Accounts that pass the account, institution and taxable/retirement filters
export function filterAccounts(accounts: Account[], f: InvestmentFilters) {
  return accounts.filter(a =>
    (f.accounts.length === 0 || f.accounts.includes(a.account_id)) &&
    (f.institutions.length === 0 || f.institutions.includes(a.institution)) &&
    (f.kind === 'all' || (f.kind === 'retirement') === isRetirementAccount(a))
  );
}

export function typeKey(type: string, order: string[]) {
  return order.includes(type) ? type : 'other';
}

const accountLabel = (a: Account) => `${a.name}${a.mask ? ` ••${a.mask}` : ''}`;

// One row above the chart: a Filters button plus a removable chip for each active filter
export function FilterBar({ filters, setFilters, accounts, onOpen }: {
  filters: InvestmentFilters;
  setFilters: (f: InvestmentFilters) => void;
  accounts: Account[];
  onOpen: () => void;
}) {
  const count = activeFilterCount(filters);
  const chips: { label: string; remove: () => void }[] = [
    ...(filters.kind !== 'all' ? [{ label: filters.kind === 'retirement' ? 'Retirement accounts' : 'Taxable accounts', remove: () => setFilters({ ...filters, kind: 'all' }) }] : []),
    ...filters.institutions.map(i => ({ label: i, remove: () => setFilters({ ...filters, institutions: filters.institutions.filter(x => x !== i) }) })),
    ...filters.accounts.map(id => {
      const a = accounts.find(x => x.account_id === id);
      return { label: a ? accountLabel(a) : 'Account', remove: () => setFilters({ ...filters, accounts: filters.accounts.filter(x => x !== id) }) };
    }),
    ...filters.types.map(t => ({ label: SECURITY_TYPE_LABELS[t] ?? t, remove: () => setFilters({ ...filters, types: filters.types.filter(x => x !== t) }) })),
  ];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={onOpen}
        className="shrink-0 flex items-center gap-1.5 bg-surface border border-line-strong text-ink-2 text-sm rounded-xl px-3 py-2 font-semibold hover:bg-sunken"
      >
        <SlidersHorizontal size={16} /> Filters{count > 0 && <span className="bg-accent text-on-accent text-[11px] rounded-full px-1.5">{count}</span>}
      </button>
      {chips.map(c => (
        <button key={c.label} onClick={c.remove} className="flex items-center gap-1 bg-accent-soft text-accent text-xs font-bold px-2.5 py-1.5 rounded-full hover:brightness-95 max-w-[14rem]">
          <span className="truncate">{c.label}</span> <X size={13} className="shrink-0" />
        </button>
      ))}
      {count > 1 && (
        <button onClick={() => setFilters(NO_FILTERS)} className="text-xs font-semibold text-muted hover:text-ink px-1">Clear all</button>
      )}
    </div>
  );
}

export function FilterSheet({ open, onClose, filters, setFilters, accounts, types }: {
  open: boolean;
  onClose: () => void;
  filters: InvestmentFilters;
  setFilters: (f: InvestmentFilters) => void;
  accounts: Account[];
  /** Asset types present in the holdings, with their colors */
  types: { type: string; label: string; color: string }[];
}) {
  const institutions = [...new Set(accounts.map(a => a.institution))];
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  const hasRetirement = accounts.some(isRetirementAccount);
  const hasTaxable = accounts.some(a => !isRetirementAccount(a));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter investments"
      subtitle="Filters apply to the chart, totals, allocation and holdings."
      footer={
        <div className="flex items-center justify-between">
          <button onClick={() => setFilters(NO_FILTERS)} className="text-sm font-semibold text-muted hover:text-ink">Clear all</button>
          <button onClick={onClose} className="bg-accent text-on-accent px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-accent-strong">Done</button>
        </div>
      }
    >
      <div className="p-5 space-y-6">
        {hasRetirement && hasTaxable && (
          <FilterGroup title="Account type">
            <div className="inline-flex bg-sunken rounded-xl p-1">
              {([['all', 'All'], ['taxable', 'Taxable'], ['retirement', 'Retirement']] as const).map(([id, label]) => (
                <button key={id} onClick={() => setFilters({ ...filters, kind: id })} className={cn('px-3 py-1.5 rounded-lg text-sm font-semibold', filters.kind === id ? 'bg-surface text-ink' : 'text-muted')}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-faint mt-1.5">Retirement includes 401(k), IRA, Roth, HSA and 529 accounts.</p>
          </FilterGroup>
        )}
        {institutions.length > 1 && (
          <FilterGroup title="Institution">
            {institutions.map(i => (
              <Check key={i} label={i} checked={filters.institutions.includes(i)} onChange={() => setFilters({ ...filters, institutions: toggle(filters.institutions, i) })} />
            ))}
          </FilterGroup>
        )}
        <FilterGroup title="Account">
          {accounts.map(a => (
            <Check
              key={a.account_id}
              label={accountLabel(a)}
              hint={`${a.institution}${a.subtype ? ` · ${a.subtype}` : ''}`}
              checked={filters.accounts.includes(a.account_id)}
              onChange={() => setFilters({ ...filters, accounts: toggle(filters.accounts, a.account_id) })}
            />
          ))}
        </FilterGroup>
        <FilterGroup title="Asset type">
          {types.map(t => (
            <Check
              key={t.type}
              label={t.label}
              dot={t.color}
              checked={filters.types.includes(t.type)}
              onChange={() => setFilters({ ...filters, types: toggle(filters.types, t.type) })}
            />
          ))}
        </FilterGroup>
      </div>
    </Sheet>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="eyebrow text-muted mb-2">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Check({ label, hint, checked, onChange, dot }: { label: string; hint?: string; checked: boolean; onChange: () => void; dot?: string }) {
  return (
    <label className="flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 hover:bg-sunken cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onChange} className="w-4 h-4 accent-[var(--accent)] shrink-0" />
      {dot && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />}
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink truncate">{label}</span>
        {hint && <span className="block text-[11px] text-faint truncate capitalize">{hint}</span>}
      </span>
    </label>
  );
}

// ---------- Value over time ----------

const RANGES = [
  { id: '1M', days: 31 },
  { id: '3M', days: 92 },
  { id: '1Y', days: 366 },
  { id: 'All', days: Infinity },
] as const;
type RangeId = (typeof RANGES)[number]['id'];

const LINE = 'var(--accent)';

// Sums the history series that match the filters. With an asset-type filter, days from before
// holdings were recorded (account totals only) can't be split, so the chart starts at typedSince.
export function filteredHistory(history: InvestmentHistory, accountIds: Set<string>, typeMatches: ((type: string) => boolean) | null) {
  const typed = typeMatches != null;
  const series = history.series.filter(s => accountIds.has(s.account_id) && (typed ? s.type != null && typeMatches(s.type) : true));
  const points = history.dates.map((date, i) => ({ date, value: series.reduce((sum, s) => sum + s.values[i], 0) }));
  return typed && history.typedSince ? points.filter(p => p.date >= history.typedSince!) : points;
}

export function ValueChart({ points, current, title = 'Value over time', emptyText }: {
  points: { date: string; value: number }[];
  /** Today's value, so the headline matches the totals even before today's snapshot is saved */
  current: number;
  title?: string;
  emptyText?: string;
}) {
  const [range, setRange] = usePref('ws_investment_range');
  const rangeId: RangeId = (RANGES.find(r => r.id === range)?.id ?? '3M');
  const { hidden } = usePrivacy();

  const days = RANGES.find(r => r.id === rangeId)!.days;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (Number.isFinite(days) ? days : 0));
  const inRange = Number.isFinite(days) ? points.filter(p => p.date >= dayKey(cutoff)) : points;
  // End on today's live value
  const today = dayKey(new Date());
  const series = [...inRange.filter(p => p.date < today), { date: today, value: current }];

  if (points.length < 1 || series.length < 2) {
    return (
      <p className="text-xs text-muted bg-sunken rounded-xl p-3">
        {emptyText ?? 'Moneta records your investments every day. Your chart will start filling in tomorrow.'}
      </p>
    );
  }

  const first = series[0].value;
  const change = current - first;
  const pct = first !== 0 ? change / Math.abs(first) : 0;
  const chartData = series.map(p => ({
    label: parseDay(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(rangeId === 'All' || rangeId === '1Y' ? { year: '2-digit' } : {}) }),
    value: p.value,
  }));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="eyebrow text-muted">{title}</p>
          <p className={cn('text-sm font-semibold mt-1', change >= 0 ? 'text-positive' : 'text-negative')}>
            <Money value={change} signed whole /> ({change >= 0 ? '+' : '−'}{Math.abs(pct * 100).toFixed(1)}%)
            <span className="text-faint font-medium"> {rangeId === 'All' ? 'all time' : `past ${rangeId === '1M' ? 'month' : rangeId === '3M' ? '3 months' : 'year'}`}</span>
          </p>
        </div>
        <div className="inline-flex bg-sunken rounded-lg p-0.5 text-xs font-semibold">
          {RANGES.map(r => (
            <button key={r.id} onClick={() => setRange(r.id)} className={cn('px-2.5 py-1 rounded-md', rangeId === r.id ? 'bg-surface text-ink' : 'text-muted')}>
              {r.id}
            </button>
          ))}
        </div>
      </div>
      <div className={cn('h-44 sm:h-52 mt-3 -mx-1', hidden && 'blur-md')}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="inv-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={LINE} stopOpacity={0.18} />
                <stop offset="100%" stopColor={LINE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--faint)' }} axisLine={false} tickLine={false} minTickGap={40} />
            <YAxis hide domain={['dataMin', 'dataMax']} tickFormatter={formatCompact} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)', fontSize: 13 }}
              formatter={v => [hidden ? '•••' : formatMoney(Number(v)), 'Value']}
            />
            <Area type="monotone" dataKey="value" stroke={LINE} strokeWidth={2} fill="url(#inv-fill)" activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------- One holding ----------

export type HoldingDetail = {
  security_id: string;
  ticker: string | null;
  name: string;
  type: string;
  is_cash: boolean;
  /** The holding in each account that has it */
  positions: (HoldingRow & { accountName: string })[];
};

export function HoldingSheet({ holding, total, onClose }: { holding: HoldingDetail | null; total: number; onClose: () => void }) {
  const [history, setHistory] = useState<{ key: string; points: SecurityPoint[] } | null>(null);
  const accountIds = holding?.positions.map(p => p.account_id).join(',') ?? '';
  const key = holding ? `${holding.security_id}|${accountIds}` : '';

  useEffect(() => {
    if (!holding) return;
    let cancelled = false;
    fetch(`/api/investments/security?id=${encodeURIComponent(holding.security_id)}&accounts=${encodeURIComponent(accountIds)}`)
      .then(res => (res.ok ? res.json() : []))
      .then((points: SecurityPoint[]) => { if (!cancelled) setHistory({ key, points }); })
      .catch(() => { if (!cancelled) setHistory({ key, points: [] }); });
    return () => { cancelled = true; };
  }, [holding, accountIds, key]);

  if (!holding) return null;
  const value = holding.positions.reduce((s, p) => s + p.value, 0);
  const quantity = holding.positions.reduce((s, p) => s + p.quantity, 0);
  const withBasis = holding.positions.every(p => p.cost_basis != null) && !holding.is_cash;
  const basis = withBasis ? holding.positions.reduce((s, p) => s + (p.cost_basis ?? 0), 0) : null;
  const gain = basis != null ? value - basis : null;
  const loaded = history?.key === key ? history.points : null;

  return (
    <Sheet open onClose={onClose} title={holding.ticker ?? holding.name} subtitle={holding.ticker ? holding.name : SECURITY_TYPE_LABELS[holding.type] ?? holding.type}>
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Value" value={<Money value={value} whole />} />
          <Stat label={holding.is_cash ? 'Share' : 'Gain / loss'} value={
            holding.is_cash || gain == null
              ? <span>{total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '—'}</span>
              : <Money value={gain} signed whole className={gain >= 0 ? 'text-positive' : 'text-negative'} />
          } />
          <Stat label={holding.is_cash ? 'Type' : 'Shares'} value={<span className="tabular-nums">{holding.is_cash ? 'Cash' : quantity.toLocaleString('en-US', { maximumFractionDigits: 3 })}</span>} />
        </div>
        {!holding.is_cash && (
          <p className="text-sm text-muted -mt-2">
            Price <Money value={holding.positions[0].price} className="font-semibold text-ink" />
            {basis != null && <> · cost basis <Money value={basis} whole className="font-semibold text-ink" /> ({gain! >= 0 ? '+' : '−'}{basis > 0 ? Math.abs((gain! / basis) * 100).toFixed(1) : '0'}%)</>}
            {total > 0 && <> · {((value / total) * 100).toFixed(1)}% of shown portfolio</>}
          </p>
        )}

        <Card className="p-4">
          {loaded == null
            ? <div className="h-44 animate-pulse rounded-xl bg-sunken" />
            : <ValueChart points={loaded} current={value} emptyText="Moneta started recording this holding today. Its chart fills in from here." />}
        </Card>

        <section>
          <h3 className="eyebrow text-muted mb-2">Held in</h3>
          <ul className="divide-y divide-line">
            {holding.positions.map(p => (
              <li key={p.account_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block font-semibold text-ink truncate">{p.accountName}</span>
                  {!holding.is_cash && <span className="block text-xs text-muted tabular-nums">{p.quantity.toLocaleString('en-US', { maximumFractionDigits: 3 })} shares</span>}
                </span>
                <Money value={p.value} className="font-semibold shrink-0" />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-sunken p-3 min-w-0">
      <p className="eyebrow text-[10px] text-muted">{label}</p>
      <p className="font-display text-2xl tracking-tight leading-none mt-1.5 truncate">{value}</p>
    </div>
  );
}
