'use client';
import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { categoryMeta, displayName, friendlyDay, type DashboardData, type Txn } from '@/lib/finance';
import { buildRecap, monthsWithData, recapTransactions, type MonthlyRecap as Recap } from '@/lib/insights';
import type { TxnRules } from '@/lib/transfers';
import type { RecurringItem } from '@/lib/recurring';
import { Card, Money, SectionTitle, Sheet, TransactionIcon, cn, tint } from './ui';
import { NetWorthChangeBreakdown } from './NetWorthChange';
import type { Drill } from './DrillSheet';

// Teaser on the Overview: last month's headline, tap for the full recap
export function RecapCard({ recap, onOpen }: { recap: Recap; onOpen: () => void }) {
  return (
    <Card className="p-6">
      <SectionTitle action={
        <button onClick={onOpen} className="text-sm font-semibold text-accent flex items-center gap-0.5 normal-case tracking-normal">
          Full recap <ChevronRight size={16} />
        </button>
      }>{recap.label} in review</SectionTitle>
      <button onClick={onOpen} className="w-full text-left">
        <p className="text-ink-2 leading-relaxed">
          {recap.saved >= 0 ? 'You saved ' : 'You spent '}
          <Money value={Math.abs(recap.saved)} whole className={cn('font-semibold', recap.saved >= 0 ? 'text-positive' : 'text-negative')} />
          {recap.saved >= 0 ? '' : ' more than you earned'}
          {recap.savingsRate != null && recap.saved >= 0 && <> ({Math.round(recap.savingsRate * 100)}% of income)</>}
          {recap.netWorth && (
            <>, and your net worth {recap.netWorth.change >= 0 ? 'grew' : 'fell'} by{' '}
              <Money value={Math.abs(recap.netWorth.change)} whole className={cn('font-semibold', recap.netWorth.change >= 0 ? 'text-positive' : 'text-negative')} />
            </>
          )}.
          {recap.shifts[0] && (
            <> {recap.shifts[0].label} was <Money value={Math.abs(recap.shifts[0].diff)} whole className="font-semibold" /> {recap.shifts[0].diff > 0 ? 'above' : 'below'} your usual.</>
          )}
        </p>
      </button>
    </Card>
  );
}

export function MonthlyRecapSheet({ month, setMonth, data, rules, recurring, onClose, onDrill, onSelect, onAskAI }: {
  month: string | null;
  setMonth: (m: string) => void;
  data: DashboardData;
  rules: TxnRules;
  recurring: RecurringItem[];
  onClose: () => void;
  onDrill: (d: Drill) => void;
  onSelect: (t: Txn) => void;
  onAskAI: (prompt: string) => void;
}) {
  const months = useMemo(() => monthsWithData(data.transactions), [data.transactions]);
  const recap = useMemo(
    () => (month ? buildRecap(month, data.transactions, rules, recurring, data.history ?? []) : null),
    [month, data, rules, recurring]
  );
  if (!month || !recap) return null;

  const idx = months.indexOf(month);
  const older = idx >= 0 && idx < months.length - 1 ? months[idx + 1] : null;
  const newer = idx > 0 ? months[idx - 1] : null;
  const drill = (title: string, what: Parameters<typeof recapTransactions>[3], total: 'spending' | 'income') =>
    onDrill({ kind: 'txns', title, subtitle: recap.label, txns: recapTransactions(month, data.transactions, rules, what), total });

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={<span className="flex items-center gap-2">
        <button onClick={() => older && setMonth(older)} disabled={!older} aria-label="Previous month" className="p-1 rounded-lg hover:bg-sunken disabled:opacity-25"><ChevronLeft size={22} /></button>
        <span>{recap.label}{recap.complete ? '' : ' so far'}</span>
        <button onClick={() => newer && setMonth(newer)} disabled={!newer} aria-label="Next month" className="p-1 rounded-lg hover:bg-sunken disabled:opacity-25"><ChevronRight size={22} /></button>
      </span>}
      subtitle="Your month in review"
      footer={
        <button
          onClick={() => onAskAI(`Give me a short, friendly review of my ${recap.label} finances: what went well, what stood out, and one or two things to watch next month.`)}
          className="w-full flex items-center justify-center gap-2 bg-ink text-canvas py-3 rounded-xl font-semibold hover:bg-ink-2"
        >
          <Sparkles size={18} /> Ask AI to explain this month
        </button>
      }
    >
      <div className="p-5 space-y-6">
        {/* Headline numbers */}
        <div className="grid grid-cols-3 gap-3">
          <Headline label="Income" value={recap.income} prev={recap.previous?.income} good="up" onClick={() => drill('Income', 'income', 'income')} />
          <Headline label="Spent" value={recap.spent} prev={recap.previous?.spent} good="down" onClick={() => drill('Spending', 'spent', 'spending')} />
          <Headline label="Saved" value={recap.saved} prev={recap.previous?.saved} good="up" />
        </div>
        {recap.savingsRate != null && (
          <p className="text-sm text-muted -mt-3">
            Savings rate: <span className={cn('font-semibold', recap.savingsRate >= 0 ? 'text-positive' : 'text-negative')}>{Math.round(recap.savingsRate * 100)}%</span> of income
          </p>
        )}

        {/* Net worth */}
        {recap.netWorth && (
          <section>
            <SectionTitle>Net worth <Money value={recap.netWorth.change} signed whole className={cn('ml-1 normal-case tracking-normal', recap.netWorth.change >= 0 ? 'text-positive' : 'text-negative')} /></SectionTitle>
            <NetWorthChangeBreakdown change={recap.netWorth} />
          </section>
        )}

        {/* Category shifts */}
        {recap.shifts.length > 0 && (
          <section>
            <SectionTitle>Compared with your usual</SectionTitle>
            <ul className="space-y-1">
              {recap.shifts.map(s => {
                const meta = categoryMeta(s.key);
                const Icon = meta.icon;
                return (
                  <li key={s.key}>
                    <button onClick={() => drill(s.label, { category: s.key }, 'spending')} className="w-full flex items-center gap-3 rounded-xl p-2 -mx-2 hover:bg-sunken text-left">
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: tint(meta.color), color: meta.color }}><Icon size={16} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold text-ink text-sm truncate">{s.label}</span>
                        <span className="block text-xs text-muted"><Money value={s.total} whole /> vs. <Money value={s.average} whole /> on average</span>
                      </span>
                      <span className={cn('flex items-center gap-1 text-sm font-semibold shrink-0', s.diff > 0 ? 'text-warn' : 'text-positive')}>
                        {s.diff > 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                        <Money value={s.diff} signed whole />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Biggest purchases */}
        {recap.biggest.length > 0 && (
          <section>
            <SectionTitle>Biggest one-off purchases</SectionTitle>
            <ul className="space-y-1">
              {recap.biggest.map(t => (
                <li key={t.transaction_id}>
                  <button onClick={() => onSelect(t)} className="w-full flex items-center gap-3 rounded-xl p-2 -mx-2 hover:bg-sunken text-left">
                    <TransactionIcon t={t} categoryKey={rules.groupKey(t)} />
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-ink text-sm truncate">{displayName(t)}</span>
                      <span className="block text-xs text-muted">{friendlyDay(t.date)}</span>
                    </span>
                    <Money value={t.amount} className="font-semibold text-ink shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Recurring changes */}
        {(recap.newRecurring.length > 0 || recap.priceChanges.length > 0) && (
          <section>
            <SectionTitle>Subscriptions & bills</SectionTitle>
            <ul className="space-y-2 text-sm">
              {recap.newRecurring.map(r => (
                <li key={`new-${r.key}`}>
                  <button onClick={() => onDrill({ kind: 'merchant', key: r.key, name: r.name })} className="w-full flex justify-between gap-3 text-left hover:underline">
                    <span><span className="font-semibold text-ink">{r.name}</span> <span className="text-muted">started</span></span>
                    <Money value={r.amount} className="font-semibold" />
                  </button>
                </li>
              ))}
              {recap.priceChanges.map(r => (
                <li key={`price-${r.key}`}>
                  <button onClick={() => onDrill({ kind: 'merchant', key: r.key, name: r.name })} className="w-full flex justify-between gap-3 text-left hover:underline">
                    <span><span className="font-semibold text-ink">{r.name}</span> <span className="text-muted">changed price</span></span>
                    <span className={cn('font-semibold', r.priceChange!.to > r.priceChange!.from ? 'text-warn' : 'text-positive')}>
                      <Money value={r.priceChange!.from} /> → <Money value={r.priceChange!.to} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Sheet>
  );
}

function Headline({ label, value, prev, good, onClick }: {
  label: string;
  value: number;
  prev?: number;
  /** Which direction is good news */
  good: 'up' | 'down';
  onClick?: () => void;
}) {
  const diff = prev != null ? value - prev : null;
  const better = diff != null && (good === 'up' ? diff > 0 : diff < 0);
  const content = (
    <>
      <p className="eyebrow text-[10px] text-muted">{label}</p>
      <Money value={value} whole className="block font-display text-2xl sm:text-3xl tracking-tight leading-none mt-1.5" />
      {diff != null && Math.abs(diff) >= 1 && (
        <p className={cn('text-[11px] font-semibold mt-1.5', better ? 'text-positive' : 'text-warn')}>
          <Money value={diff} signed whole /> vs. last month
        </p>
      )}
    </>
  );
  return onClick
    ? <button onClick={onClick} className="rounded-xl bg-sunken p-3 text-left hover:brightness-95">{content}</button>
    : <div className="rounded-xl bg-sunken p-3">{content}</div>;
}
