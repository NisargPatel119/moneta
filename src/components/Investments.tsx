'use client';
import { useMemo, useState } from 'react';
import { LineChart, Plus } from 'lucide-react';
import { type DashboardData, type HoldingRow, SECURITY_TYPE_LABELS } from '@/lib/finance';
import { Card, Money, SectionTitle, cn, usePrivacy } from './ui';

// Validated categorical palette (dataviz skill), assigned in fixed order by type, so a
// filter that removes a type never repaints the others.
const TYPE_ORDER = ['equity', 'etf', 'mutual fund', 'fixed income', 'cash', 'cryptocurrency', 'derivative', 'other'];
const TYPE_COLORS: Record<string, string> = {
  equity: '#2a78d6',
  etf: '#eb6834',
  'mutual fund': '#1baf7a',
  'fixed income': '#eda100',
  cash: '#e87ba4',
  cryptocurrency: '#008300',
};
const OTHER_COLOR = '#94a3b8';

type Combined = HoldingRow & { gain: number | null; accounts: number };
type Sort = 'value' | 'gain' | 'name';

export function Investments({ data, onLinkBrokerage }: { data: DashboardData; onLinkBrokerage: () => void }) {
  const [accountId, setAccountId] = useState('all');
  const [sort, setSort] = useState<Sort>('value');
  const { hidden } = usePrivacy();

  const investmentAccounts = data.accounts.filter(a => a.type === 'investment' && data.holdings.some(h => h.account_id === a.account_id));

  const holdings = useMemo(() => {
    const rows = data.holdings.filter(h => accountId === 'all' || h.account_id === accountId);
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
  }, [data.holdings, accountId]);

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

  const allocation = TYPE_ORDER
    .map(type => ({
      type,
      label: SECURITY_TYPE_LABELS[type] ?? type,
      color: TYPE_COLORS[type] ?? OTHER_COLOR,
      value: holdings.filter(h => (TYPE_ORDER.includes(h.type) ? h.type : 'other') === type).reduce((s, h) => s + h.value, 0),
    }))
    .filter(a => a.value > 0);

  if (data.holdings.length === 0) {
    return (
      <Card className="p-10 text-center">
        <div className="mx-auto w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
          <LineChart size={26} />
        </div>
        <h3 className="text-lg font-semibold mt-5">No holdings yet</h3>
        <p className="text-slate-500 mt-2 text-sm max-w-sm mx-auto">
          Link a brokerage or retirement account (Fidelity, Vanguard, Schwab, Robinhood…) to see your positions, allocation and gains.
          If you already linked one, re-link it so Moneta can read its holdings.
        </p>
        <button onClick={onLinkBrokerage} className="mt-6 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 inline-flex items-center gap-2">
          <Plus size={18} /> Link a brokerage
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {investmentAccounts.length > 1 && (
        <select
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
          className="w-full sm:w-auto sm:max-w-xs truncate bg-white border border-slate-300 text-slate-900 text-sm rounded-xl p-2.5 font-medium shadow-sm outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All investment accounts</option>
          {investmentAccounts.map(a => (
            <option key={a.account_id} value={a.account_id}>{a.name}{a.mask ? ` ••${a.mask}` : ''}</option>
          ))}
        </select>
      )}

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Portfolio value</p>
          <Money value={total} className="block text-xl sm:text-2xl font-bold text-slate-900 mt-1" />
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total gain / loss</p>
          {withBasis.length > 0 ? (
            <div className="flex items-baseline gap-2 flex-wrap mt-1">
              <Money value={totalGain} signed className={cn('text-xl sm:text-2xl font-bold', totalGain >= 0 ? 'text-green-600' : 'text-red-600')} />
              {gainPct != null && (
                <span className={cn('text-sm font-semibold', totalGain >= 0 ? 'text-green-600' : 'text-red-600')}>
                  {totalGain >= 0 ? '+' : '−'}{Math.abs(gainPct * 100).toFixed(1)}%
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500 mt-2">Your brokerage didn&apos;t share cost basis.</p>
          )}
          {withBasis.length > 0 && withBasis.length < holdings.filter(h => !h.is_cash).length && (
            <p className="text-[11px] text-slate-400 mt-1">On {withBasis.length} of {holdings.filter(h => !h.is_cash).length} positions with a reported cost basis</p>
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
              <span className="text-slate-700 font-medium flex-1">{a.label}</span>
              <Money value={a.value} whole className="font-semibold text-slate-900" />
              <span className="text-slate-400 text-xs w-10 text-right">{Math.round((a.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Holdings */}
      <Card className="overflow-hidden">
        <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 flex items-center justify-between gap-3 border-b border-slate-100">
          <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">{holdings.length} holdings</h3>
          <div className="inline-flex bg-slate-100 rounded-lg p-0.5 text-xs font-semibold">
            {(['value', 'gain', 'name'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={cn('px-2.5 py-1 rounded-md capitalize', sort === s ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500')}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {sorted.map(h => {
            const pct = h.gain != null && h.cost_basis ? h.gain / h.cost_basis : null;
            return (
              <li key={h.security_id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-[10px] font-black tracking-tight"
                  style={{ backgroundColor: `${TYPE_COLORS[h.type] ?? OTHER_COLOR}1a`, color: TYPE_COLORS[h.type] ?? OTHER_COLOR }}
                >
                  {(h.ticker ?? h.name).slice(0, 5).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 truncate">{h.ticker ?? h.name}</p>
                  <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                    {h.ticker && <>{h.name} · </>}
                    {h.is_cash ? 'Cash' : <>{formatQty(h.quantity)} × <Money value={h.price} /></>}
                    {h.accounts > 1 && <> · {h.accounts} accounts</>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <Money value={h.value} className="font-bold text-slate-900" />
                  {h.gain != null && (
                    <p className={cn('text-xs font-semibold mt-0.5', h.gain >= 0 ? 'text-green-600' : 'text-red-600')}>
                      <Money value={h.gain} signed whole />
                      {pct != null && <> ({h.gain >= 0 ? '+' : '−'}{Math.abs(pct * 100).toFixed(1)}%)</>}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400 font-medium">{((h.value / total) * 100).toFixed(1)}% of portfolio</p>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-slate-400 px-5 py-3 border-t border-slate-100">
          Prices come from your brokerage and may be delayed. Gains are based on the cost basis your brokerage reports.
        </p>
      </Card>
    </div>
  );
}

function formatQty(q: number) {
  return q.toLocaleString('en-US', { maximumFractionDigits: q < 1 ? 4 : 3 });
}
