'use client';
import { useMemo, useState } from 'react';
import { ChevronRight, LineChart, Plus } from 'lucide-react';
import { type DashboardData, type HoldingRow, SECURITY_TYPE_LABELS } from '@/lib/finance';
import { Card, Money, SectionTitle, cn, usePrivacy, tint } from './ui';
import {
  FilterBar, FilterSheet, HoldingSheet, ValueChart, activeFilterCount, filterAccounts, filteredHistory, typeKey,
  useInvestmentFilters, type HoldingDetail,
} from './InvestmentInsights';

// Validated categorical palette (dataviz skill), assigned in fixed order by type, so a
// filter that removes a type never repaints the others.
const TYPE_ORDER = ['equity', 'etf', 'mutual fund', 'fixed income', 'cash', 'cryptocurrency', 'derivative', 'other'];
const TYPE_COLORS: Record<string, string> = {
  equity: 'var(--series-1)',
  etf: 'var(--series-2)',
  'mutual fund': 'var(--series-3)',
  'fixed income': 'var(--series-4)',
  cash: 'var(--series-5)',
  cryptocurrency: 'var(--series-6)',
};
const OTHER_COLOR = 'var(--faint)';

type Combined = HoldingRow & { gain: number | null; accounts: number };
type Sort = 'value' | 'gain' | 'name';

export function Investments({ data, onLinkBrokerage }: { data: DashboardData; onLinkBrokerage: () => void }) {
  const [sort, setSort] = useState<Sort>('value');
  const [filters, setFilters] = useInvestmentFilters();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<HoldingDetail | null>(null);
  const { hidden } = usePrivacy();

  const investmentAccounts = useMemo(
    () => data.accounts.filter(a => a.type === 'investment' && data.holdings.some(h => h.account_id === a.account_id)),
    [data.accounts, data.holdings]
  );
  // Accounts that pass the account, institution and taxable/retirement filters
  const shownAccounts = useMemo(() => new Set(filterAccounts(investmentAccounts, filters).map(a => a.account_id)), [investmentAccounts, filters]);
  const typeMatches = useMemo(
    () => (filters.types.length === 0 ? null : (type: string) => filters.types.includes(typeKey(type, TYPE_ORDER))),
    [filters.types]
  );
  const filteredRows = useMemo(
    () => data.holdings.filter(h => shownAccounts.has(h.account_id) && (!typeMatches || typeMatches(h.type))),
    [data.holdings, shownAccounts, typeMatches]
  );
  const historyPoints = useMemo(
    () => (data.investmentHistory ? filteredHistory(data.investmentHistory, shownAccounts, typeMatches) : []),
    [data.investmentHistory, shownAccounts, typeMatches]
  );

  const holdings = useMemo(() => {
    const rows = filteredRows;
    // Combine the same security held in several accounts
    const bySecurity = new Map<string, Combined>();
    for (const h of rows) {
      const existing = bySecurity.get(h.security_id);
      if (existing) {
        existing.quantity += h.quantity;
        existing.value += h.value;
        existing.cost_basis = existing.cost_basis != null && h.cost_basis != null ? existing.cost_basis + h.cost_basis : null;
        existing.accounts += 1;
      } else {
        bySecurity.set(h.security_id, { ...h, gain: null, accounts: 1 });
      }
    }
    const combined = [...bySecurity.values()];
    for (const h of combined) h.gain = h.cost_basis != null && !h.is_cash ? h.value - h.cost_basis : null;
    return combined;
  }, [filteredRows]);

  const sorted = useMemo(() => [...holdings].sort((a, b) =>
    sort === 'name' ? (a.ticker ?? a.name).localeCompare(b.ticker ?? b.name)
      : sort === 'gain' ? (b.gain ?? -Infinity) - (a.gain ?? -Infinity)
        : b.value - a.value
  ), [holdings, sort]);

  const total = holdings.reduce((s, h) => s + h.value, 0);
  const withBasis = holdings.filter(h => h.gain != null);
  const totalGain = withBasis.reduce((s, h) => s + (h.gain ?? 0), 0);
  const totalBasis = withBasis.reduce((s, h) => s + (h.cost_basis ?? 0), 0);
  const gainPct = totalBasis > 0 ? totalGain / totalBasis : null;
  const accountCount = new Set(filteredRows.map(h => h.account_id)).size;
  const cashPct = total > 0 ? (holdings.filter(h => h.is_cash).reduce((s, h) => s + h.value, 0) / total) * 100 : 0;

  const allocation = TYPE_ORDER
    .map(type => ({
      type,
      label: SECURITY_TYPE_LABELS[type] ?? type,
      color: TYPE_COLORS[type] ?? OTHER_COLOR,
      value: holdings.filter(h => (TYPE_ORDER.includes(h.type) ? h.type : 'other') === type).reduce((s, h) => s + h.value, 0),
    }))
    .filter(a => a.value > 0);

  // Every asset type in the holdings, for the filter sheet (colors stay fixed per type)
  const presentTypes = TYPE_ORDER
    .filter(type => data.holdings.some(h => typeKey(h.type, TYPE_ORDER) === type))
    .map(type => ({ type, label: SECURITY_TYPE_LABELS[type] ?? type, color: TYPE_COLORS[type] ?? OTHER_COLOR }));

  const accountName = (id: string) => {
    const a = data.accounts.find(x => x.account_id === id);
    return a ? `${a.name}${a.mask ? ` ••${a.mask}` : ''}` : 'Account';
  };
  const openHolding = (h: Combined) => setSelected({
    security_id: h.security_id, ticker: h.ticker, name: h.name, type: h.type, is_cash: h.is_cash,
    positions: filteredRows.filter(r => r.security_id === h.security_id).map(r => ({ ...r, accountName: accountName(r.account_id) })),
  });

  if (data.holdings.length === 0) {
    return (
      <Card className="p-10 text-center">
        <div className="mx-auto w-14 h-14 bg-accent-soft rounded-full flex items-center justify-center text-accent">
          <LineChart size={26} />
        </div>
        <h3 className="text-lg font-semibold mt-5">No holdings yet</h3>
        <p className="text-muted mt-2 text-sm max-w-sm mx-auto">
          Link a brokerage or retirement account (Fidelity, Vanguard, Schwab, Robinhood…) to see your positions, allocation and gains.
          If you already linked one, re-link it so Moneta can read its holdings.
        </p>
        <button onClick={onLinkBrokerage} className="mt-6 bg-accent text-on-accent px-5 py-2.5 rounded-xl font-semibold hover:bg-accent-strong inline-flex items-center gap-2">
          <Plus size={18} /> Link a brokerage
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <FilterBar filters={filters} setFilters={setFilters} accounts={investmentAccounts} onOpen={() => setFiltersOpen(true)} />

      {holdings.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="font-semibold text-ink">No holdings match these filters</p>
          <button onClick={() => setFiltersOpen(true)} className="mt-2 text-sm font-semibold text-accent">Change filters</button>
        </Card>
      ) : (<>
      <Card className="p-5 sm:p-6">
        <ValueChart points={historyPoints} current={total} title={activeFilterCount(filters) > 0 ? 'Filtered value over time' : 'Portfolio value over time'} />
        {typeMatches && data.investmentHistory?.typedSince && data.investmentHistory.typedSince > (data.investmentHistory.dates[0] ?? '') && (
          <p className="text-[11px] text-faint mt-2">
            With an asset-type filter, the chart starts when Moneta began recording individual holdings.
          </p>
        )}
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 sm:p-5">
          <p className="eyebrow text-muted">Portfolio value</p>
          <Money value={total} whole className="block text-3xl sm:text-4xl font-display font-normal tracking-tight leading-none text-ink mt-2" />
          {/* Mirrors the gain tile's badge + footnote so the two tiles line up */}
          <span className="inline-block mt-2 text-xs font-semibold tabular-nums rounded-full px-2 py-0.5 bg-sunken text-ink-2">
            {accountCount} account{accountCount === 1 ? '' : 's'}
          </span>
          <p className="text-[11px] text-faint mt-1">
            {holdings.length} holdings{cashPct >= 0.5 && <> · {Math.round(cashPct)}% in cash</>}
          </p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="eyebrow text-muted">Total gain / loss</p>
          {withBasis.length > 0 ? (
            <div className="mt-2">
              <Money value={totalGain} signed whole className={cn('block text-3xl sm:text-4xl font-display font-normal tracking-tight leading-none', totalGain >= 0 ? 'text-positive' : 'text-negative')} />
              {gainPct != null && (
                <span className={cn(
                  'inline-block mt-2 text-xs font-semibold tabular-nums rounded-full px-2 py-0.5',
                  totalGain >= 0 ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative'
                )}>
                  {totalGain >= 0 ? '+' : '−'}{Math.abs(gainPct * 100).toFixed(1)}%
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted mt-2">Your brokerage didn&apos;t share cost basis.</p>
          )}
          {withBasis.length > 0 && withBasis.length < holdings.filter(h => !h.is_cash).length && (
            <p className="text-[11px] text-faint mt-1">Based on {withBasis.length} of {holdings.filter(h => !h.is_cash).length} positions</p>
          )}
        </Card>
      </div>

      {/* Allocation */}
      <Card className="p-5 sm:p-6">
        <SectionTitle>Allocation</SectionTitle>
        <div className={cn('flex h-3 rounded-full overflow-hidden gap-0.5', hidden && 'blur-sm')} role="img" aria-label="Allocation by asset type">
          {allocation.map(a => (
            <div key={a.type} title={a.label} style={{ width: `${(a.value / total) * 100}%`, backgroundColor: a.color }} />
          ))}
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mt-4">
          {allocation.map(a => (
            <li key={a.type} className="flex items-center gap-2 text-sm">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
              <span className="text-ink-2 font-medium flex-1">{a.label}</span>
              <Money value={a.value} whole className="font-semibold text-ink" />
              <span className="text-faint text-xs w-10 text-right">{Math.round((a.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Holdings */}
      <Card className="overflow-hidden">
        <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 flex items-center justify-between gap-3 border-b border-line">
          <h3 className="text-muted eyebrow">{holdings.length} holdings</h3>
          <div className="inline-flex bg-sunken rounded-lg p-0.5 text-xs font-semibold">
            {(['value', 'gain', 'name'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={cn('px-2.5 py-1 rounded-md capitalize', sort === s ? 'bg-surface text-ink' : 'text-muted')}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <ul className="divide-y divide-line">
          {sorted.map(h => {
            const pct = h.gain != null && h.cost_basis ? h.gain / h.cost_basis : null;
            return (
              <li key={h.security_id}>
                <button onClick={() => openHolding(h)} className="w-full text-left flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-sunken transition-colors">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-[10px] font-black tracking-tight"
                  style={{ backgroundColor: tint(TYPE_COLORS[h.type] ?? OTHER_COLOR), color: TYPE_COLORS[h.type] ?? OTHER_COLOR }}
                >
                  {(h.ticker ?? h.name).slice(0, 5).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink truncate">{h.ticker ?? h.name}</p>
                  <p className="text-xs text-muted font-medium truncate mt-0.5">
                    {h.ticker && <>{h.name} · </>}
                    {h.is_cash ? 'Cash' : <>{formatQty(h.quantity)} × <Money value={h.price} /></>}
                    {h.accounts > 1 && <> · {h.accounts} accounts</>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <Money value={h.value} className="font-bold text-ink" />
                  {h.gain != null && (
                    <p className={cn('text-xs font-semibold mt-0.5', h.gain >= 0 ? 'text-positive' : 'text-negative')}>
                      <Money value={h.gain} signed whole />
                      {pct != null && <> ({h.gain >= 0 ? '+' : '−'}{Math.abs(pct * 100).toFixed(1)}%)</>}
                    </p>
                  )}
                  <p className="text-[11px] text-faint font-medium">{((h.value / total) * 100).toFixed(1)}% of {activeFilterCount(filters) > 0 ? 'shown' : 'portfolio'}</p>
                </div>
                <ChevronRight size={16} className="text-faint shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-faint px-5 py-3 border-t border-line">
          Prices come from your brokerage and may be delayed. Gains are based on the cost basis your brokerage reports.
        </p>
      </Card>
      </>)}

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        setFilters={setFilters}
        accounts={investmentAccounts}
        types={presentTypes}
      />
      <HoldingSheet holding={selected} total={total} onClose={() => setSelected(null)} />
    </div>
  );
}

function formatQty(q: number) {
  return q.toLocaleString('en-US', { maximumFractionDigits: q < 1 ? 4 : 3 });
}
