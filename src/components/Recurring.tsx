'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp, X } from 'lucide-react';
import { dayKey, friendlyDay, parseDay, type Txn } from '@/lib/finance';
import { FREQUENCY_LABELS, projectOccurrences, type RecurringItem, type RecurringKind } from '@/lib/recurring';
import { Card, Money, SectionTitle, TransactionIcon, cn } from './ui';

const SECTIONS: { kind: RecurringKind; title: string; empty: string }[] = [
  { kind: 'subscription', title: 'Subscriptions', empty: 'No subscriptions found yet.' },
  { kind: 'bill', title: 'Bills', empty: 'No recurring bills found yet.' },
  { kind: 'income', title: 'Income', empty: 'No regular income found yet.' },
];

export function Recurring({ items, dismissedCount, onDismiss, onRestoreAll }: {
  items: RecurringItem[];
  dismissedCount: number;
  onDismiss: (key: string) => void;
  onRestoreAll: () => void;
}) {
  const outflows = items.filter(i => i.kind !== 'income');
  const monthlyOut = outflows.reduce((s, i) => s + i.monthly, 0);
  const monthlyIn = items.filter(i => i.kind === 'income').reduce((s, i) => s + i.monthly, 0);
  const subscriptions = items.filter(i => i.kind === 'subscription');
  const increases = items.filter(i => i.priceChange && i.priceChange.to > i.priceChange.from);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Bills & subs</p>
          <Money value={monthlyOut} whole className="block text-lg sm:text-2xl font-bold text-slate-900 mt-1" />
          <p className="text-[11px] text-slate-400">per month</p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Subscriptions</p>
          <p className="text-lg sm:text-2xl font-bold text-slate-900 mt-1">{subscriptions.length}</p>
          <p className="text-[11px] text-slate-400"><Money value={subscriptions.reduce((s, i) => s + i.monthly, 0)} whole /> / mo</p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Income</p>
          <Money value={monthlyIn} whole className="block text-lg sm:text-2xl font-bold text-green-600 mt-1" />
          <p className="text-[11px] text-slate-400">per month</p>
        </Card>
      </div>

      {increases.map(i => (
        <div key={i.key} className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <TrendingUp size={18} className="shrink-0 mt-0.5" />
          <span>
            <b>{i.name}</b> went up from <Money value={i.priceChange!.from} /> to <Money value={i.priceChange!.to} className="font-bold" />
            {' '}({FREQUENCY_LABELS[i.frequency].toLowerCase()}).
          </span>
        </div>
      ))}

      <BillsCalendar items={outflows} />

      {SECTIONS.map(section => {
        const list = items.filter(i => i.kind === section.kind);
        return (
          <Card key={section.kind} className="overflow-hidden">
            <div className="px-5 pt-5">
              <SectionTitle>{section.title}</SectionTitle>
            </div>
            {list.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-slate-500">{section.empty}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {list.map(item => <RecurringRow key={item.key} item={item} onDismiss={onDismiss} />)}
              </ul>
            )}
          </Card>
        );
      })}

      <p className="text-xs text-slate-400 px-1">
        Found automatically from repeating charges in your history. It gets more accurate as Moneta stores more months.
        {dismissedCount > 0 && (
          <> {dismissedCount} dismissed · <button onClick={onRestoreAll} className="underline font-semibold">Restore</button></>
        )}
      </p>
    </div>
  );
}

function RecurringRow({ item, onDismiss }: { item: RecurringItem; onDismiss: (key: string) => void }) {
  // TransactionIcon only needs the logo and category; build the minimal shape it reads
  const iconTxn = { logo_url: item.logo_url, personal_finance_category: null, user_category: null } as unknown as Txn;
  const daysAway = Math.round((parseDay(item.nextDate).getTime() - parseDay(dayKey(new Date())).getTime()) / 86_400_000);
  const when = daysAway === 0 ? 'Today' : daysAway === 1 ? 'Tomorrow' : daysAway < 0 ? 'Due' : daysAway <= 7 ? `In ${daysAway} days` : friendlyDay(item.nextDate);

  return (
    <li className="flex items-center gap-3 px-4 sm:px-5 py-3 group">
      <TransactionIcon t={iconTxn} categoryKey={item.groupKey} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900 truncate">{item.name}</p>
        <p className="text-xs text-slate-500 font-medium mt-0.5 truncate">
          {FREQUENCY_LABELS[item.frequency]} · Next: {when}
        </p>
      </div>
      <div className="text-right shrink-0">
        <span className={cn('font-bold', item.kind === 'income' ? 'text-green-600' : 'text-slate-900')}>
          {item.variable && <span className="text-slate-400 font-medium">~</span>}
          <Money value={item.amount} />
        </span>
        {item.priceChange && (
          <p className={cn('text-[11px] font-semibold', item.priceChange.to > item.priceChange.from ? 'text-amber-600' : 'text-green-600')}>
            was <Money value={item.priceChange.from} />
          </p>
        )}
      </div>
      <button
        onClick={() => onDismiss(item.key)}
        title="Not recurring"
        aria-label={`${item.name} isn't recurring`}
        className="p-1.5 -mr-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 shrink-0"
      >
        <X size={16} />
      </button>
    </li>
  );
}

// Month grid of expected charges. Days that have passed are dimmed.
function BillsCalendar({ items }: { items: RecurringItem[] }) {
  const [offset, setOffset] = useState(0);
  const today = dayKey(new Date());
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const start = dayKey(first);
  const end = dayKey(last);

  const byDay = new Map<string, RecurringItem[]>();
  for (const o of projectOccurrences(items, start, end)) {
    byDay.set(o.date, [...(byDay.get(o.date) ?? []), o.item]);
  }

  const [selected, setSelected] = useState<string | null>(null);
  const selectedItems = selected ? byDay.get(selected) ?? [] : [];
  const monthTotal = [...byDay.entries()].reduce((s, [, list]) => s + list.reduce((a, i) => a + i.amount, 0), 0);

  const cells: (string | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: last.getDate() }, (_, i) => dayKey(new Date(first.getFullYear(), first.getMonth(), i + 1))),
  ];

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => { setOffset(o => o - 1); setSelected(null); }} disabled={offset <= 0} aria-label="Previous month" className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"><ChevronLeft size={18} /></button>
        <div className="text-center">
          <p className="font-bold text-slate-900">{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
          <p className="text-xs text-slate-500">~<Money value={monthTotal} whole /> in bills & subscriptions</p>
        </div>
        <button onClick={() => { setOffset(o => o + 1); setSelected(null); }} disabled={offset >= 2} aria-label="Next month" className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"><ChevronRight size={18} /></button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-[11px] font-bold text-slate-400 pb-1">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`blank-${i}`} />;
          const list = byDay.get(day);
          const total = list?.reduce((s, it) => s + it.amount, 0) ?? 0;
          return (
            <button
              key={day}
              onClick={() => setSelected(list ? (selected === day ? null : day) : null)}
              className={cn(
                'rounded-lg py-1.5 min-h-[3rem] flex flex-col items-center justify-start gap-0.5 transition-colors',
                list ? 'bg-blue-50 hover:bg-blue-100' : '',
                day === today && 'ring-2 ring-blue-500',
                selected === day && 'bg-blue-100',
                day < today && 'opacity-50',
              )}
            >
              <span className="text-xs font-semibold text-slate-700">{parseDay(day).getDate()}</span>
              {list && <Money value={total} whole className="text-[10px] font-bold text-blue-700 leading-none" />}
            </button>
          );
        })}
      </div>

      {selectedItems.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
          {selectedItems.map(i => (
            <li key={i.key} className="flex justify-between text-sm">
              <span className="text-slate-700 font-medium truncate">{i.name}</span>
              <Money value={i.amount} className="font-semibold text-slate-900" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
