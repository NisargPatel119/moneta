'use client';
import { useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { type InvestmentTxn, type InvestmentTxnKind, dayKey, formatMoney, parseDay } from '@/lib/finance';
import { KIND_LABELS, activityDetail, dividendsByHolding, dividendsByMonth, netContributions, splitChange } from '@/lib/investmentActivity';
import { Card, Money, SectionTitle, cn, usePrivacy } from './ui';
import { RANGE_PHRASE, seriesForRange, useInvestmentRange } from './InvestmentInsights';

const shortDate = (day: string) => parseDay(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// "Contributions $X, market growth $Y" for the range picked on the value chart
export function ContributionsCard({ points, current, txns, typeFiltered }: {
  points: { date: string; value: number }[];
  current: number;
  txns: InvestmentTxn[];
  /** Deposits belong to an account, not an asset type, so they can't be split by type */
  typeFiltered: boolean;
}) {
  const [rangeId] = useInvestmentRange();
  const series = seriesForRange(points, rangeId, current);
  if (series.length < 2) return null;

  const start = series[0];
  const split = splitChange(start.value, current, netContributions(txns, start.date, dayKey(new Date())));
  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle>Contributions vs. growth</SectionTitle>
      {typeFiltered ? (
        <p className="text-sm text-muted">Deposits can&apos;t be split by asset type. Clear the asset type filter to see this.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-sunken p-3 min-w-0">
              <p className="eyebrow text-[10px] text-muted">You added</p>
              <Money value={split.contributions} whole className="block font-display text-2xl tracking-tight leading-none mt-1.5 truncate" />
            </div>
            <div className="rounded-xl bg-sunken p-3 min-w-0">
              <p className="eyebrow text-[10px] text-muted">Market growth</p>
              <Money value={split.growth} signed whole className={cn('block font-display text-2xl tracking-tight leading-none mt-1.5 truncate', split.growth >= 0 ? 'text-positive' : 'text-negative')} />
            </div>
          </div>
          <p className="text-xs text-muted mt-3">
            Your portfolio changed by <Money value={split.change} signed whole className="font-semibold text-ink" /> over the {RANGE_PHRASE[rangeId]}.
            Growth is that change minus the money you deposited (less withdrawals), so it includes dividends.
          </p>
        </>
      )}
    </Card>
  );
}

// Dividends from the last 12 months, by month and by holding
export function DividendsCard({ txns }: { txns: InvestmentTxn[] }) {
  const { hidden } = usePrivacy();
  const today = useMemo(() => new Date(), []);
  const months = useMemo(() => dividendsByMonth(txns, today), [txns, today]);
  const holdings = useMemo(() => dividendsByHolding(txns, today), [txns, today]);
  const total = months.reduce((s, m) => s + m.total, 0);
  if (total <= 0) return null;

  const data = months.map(m => ({
    label: parseDay(`${m.month}-01`).toLocaleDateString('en-US', { month: 'short' }),
    full: parseDay(`${m.month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    total: Math.round(m.total * 100) / 100,
  }));
  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle>Dividends</SectionTitle>
      <p className="eyebrow text-muted -mt-1">Last 12 months</p>
      <Money value={total} whole className="block text-3xl font-display font-normal tracking-tight leading-none text-ink mt-2" />
      <div className={cn('h-36 mt-3 -mx-1', hidden && 'blur-md')} role="img" aria-label="Dividends received each month">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--faint)' }} axisLine={false} tickLine={false} interval={0} />
            <Tooltip
              cursor={{ fill: 'var(--sunken)' }}
              contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)', fontSize: 13 }}
              labelFormatter={(_, p) => p?.[0]?.payload?.full ?? ''}
              formatter={v => [hidden ? '•••' : formatMoney(Number(v)), 'Dividends']}
            />
            <Bar dataKey="total" fill="var(--accent)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <h3 className="eyebrow text-muted mt-4 mb-1">By holding</h3>
      <ul className="divide-y divide-line">
        {holdings.slice(0, 6).map(h => (
          <li key={h.key} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="block font-semibold text-ink truncate">{h.label}</span>
              {h.label !== h.name && <span className="block text-xs text-muted truncate">{h.name}</span>}
            </span>
            <span className="text-right shrink-0">
              <Money value={h.total} className="font-semibold" />
              <span className="block text-[11px] text-faint">{total > 0 ? Math.round((h.total / total) * 100) : 0}% of total</span>
            </span>
          </li>
        ))}
      </ul>
      {holdings.length > 6 && <p className="text-xs text-faint mt-2">and {holdings.length - 6} more</p>}
    </Card>
  );
}

const KIND_FILTERS: { id: 'all' | InvestmentTxnKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'buy', label: 'Buys' },
  { id: 'sell', label: 'Sells' },
  { id: 'dividend', label: 'Dividends' },
  { id: 'contribution', label: 'Deposits' },
  { id: 'fee', label: 'Fees' },
];
const PAGE = 12;

// Recent brokerage activity, newest first
export function ActivityCard({ txns, accountName }: { txns: InvestmentTxn[]; accountName: (id: string) => string }) {
  const [kind, setKind] = useState<'all' | InvestmentTxnKind>('all');
  const [shown, setShown] = useState(PAGE);
  // Only offer kinds that exist, so there are no empty tabs
  const kinds = KIND_FILTERS.filter(k => k.id === 'all' || txns.some(t => t.kind === k.id || (k.id === 'contribution' && t.kind === 'withdrawal')));
  const list = txns.filter(t => kind === 'all' || t.kind === kind || (kind === 'contribution' && t.kind === 'withdrawal'));
  if (txns.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b border-line">
        <h3 className="text-muted eyebrow">Activity · last 24 months</h3>
        <div className="flex gap-1.5 flex-wrap mt-3">
          {kinds.map(k => (
            <button
              key={k.id}
              onClick={() => { setKind(k.id); setShown(PAGE); }}
              aria-pressed={kind === k.id}
              className={cn('text-xs font-bold px-3 py-1.5 rounded-full', kind === k.id ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-2 hover:brightness-95')}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted px-5 py-6">Nothing here for these filters.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.slice(0, shown).map(t => {
            const detail = activityDetail(t);
            const income = t.amount < 0;
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink truncate">
                    {KIND_LABELS[t.kind]}{(t.ticker ?? (t.security_id ? t.name : null)) && <> · {t.ticker ?? t.name}</>}
                  </p>
                  <p className="text-xs text-muted font-medium truncate mt-0.5">
                    {shortDate(t.date)} · {accountName(t.account_id)}
                    {detail && <> · {detail.quantity.toLocaleString('en-US', { maximumFractionDigits: 3 })} × <Money value={detail.price} /></>}
                    {!t.security_id && t.name && <> · {t.name}</>}
                  </p>
                </div>
                <Money value={Math.abs(t.amount)} className={cn('font-bold shrink-0', t.kind === 'dividend' ? 'text-positive' : 'text-ink')} />
                <span className="sr-only">{income ? 'cash in' : 'cash out'}</span>
              </li>
            );
          })}
        </ul>
      )}
      {list.length > shown && (
        <button onClick={() => setShown(shown + PAGE)} className="w-full text-sm font-semibold text-accent py-3 border-t border-line hover:bg-sunken">
          Show more ({list.length - shown} left)
        </button>
      )}
    </Card>
  );
}
