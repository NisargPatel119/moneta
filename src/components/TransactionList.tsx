'use client';
import type { Transaction } from 'plaid';
import { categoryMeta, categoryOf, displayName, friendlyDay } from '@/lib/finance';
import { Money, TransactionIcon, cn } from './ui';

export function TransactionRow({ t, accountName }: { t: Transaction; accountName?: string }) {
  const inflow = t.amount < 0;
  return (
    <li className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-slate-50 transition-colors">
      <TransactionIcon t={t} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900 truncate">{displayName(t)}</p>
        <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
          {categoryMeta(categoryOf(t)).label}
          {accountName && <> · {accountName}</>}
        </p>
      </div>
      <div className="text-right shrink-0">
        {/* Plaid: positive = money out. Flip so inflows read as + */}
        <Money value={-t.amount} signed className={cn('font-bold', inflow ? 'text-green-600' : 'text-slate-900')} />
        {t.pending && <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mt-0.5">Pending</p>}
      </div>
    </li>
  );
}

// Groups transactions under day headers ("Today", "Yesterday", "Mon, Sep 29")
export function TransactionList({ transactions, accountName, emptyText = 'No transactions found.' }: {
  transactions: Transaction[];
  accountName?: (accountId: string) => string | undefined;
  emptyText?: string;
}) {
  if (transactions.length === 0) {
    return <p className="p-10 text-center text-slate-500 font-medium">{emptyText}</p>;
  }

  const groups: { day: string; items: Transaction[] }[] = [];
  for (const t of transactions) {
    const last = groups[groups.length - 1];
    if (last?.day === t.date) last.items.push(t);
    else groups.push({ day: t.date, items: [t] });
  }

  return (
    <div>
      {groups.map(g => (
        <section key={g.day}>
          <h4 className="sticky top-0 z-[1] bg-slate-50/95 backdrop-blur px-4 sm:px-5 py-1.5 text-xs font-bold text-slate-500 border-y border-slate-100">
            {friendlyDay(g.day)}
          </h4>
          <ul className="divide-y divide-slate-100">
            {g.items.map(t => (
              <TransactionRow key={t.transaction_id} t={t} accountName={accountName?.(t.account_id)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
