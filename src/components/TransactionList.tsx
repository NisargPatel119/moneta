'use client';
import { Pencil, StickyNote } from 'lucide-react';
import { categoryMeta, categoryOf, displayName, friendlyDay, type Txn } from '@/lib/finance';
import type { TxnRules } from '@/lib/transfers';
import { Money, TransactionIcon, cn } from './ui';

export function TransactionRow({ t, accountName, rules, onSelect }: {
  t: Txn;
  accountName?: string;
  rules?: TxnRules;
  onSelect?: (t: Txn) => void;
}) {
  const inflow = t.amount < 0;
  const key = rules ? rules.groupKey(t) : categoryOf(t);
  const content = (
    <>
      <TransactionIcon t={t} categoryKey={key} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink truncate">{displayName(t)}</p>
        <p className="text-xs text-muted font-medium truncate mt-0.5 flex items-center gap-1">
          {t.edited && <Pencil size={11} className="shrink-0 text-accent" aria-label={t.edited === 'rule' ? 'Edited by a rule' : 'Edited'} />}
          {t.notes && <StickyNote size={11} className="shrink-0 text-warn" aria-label="Has a note" />}
          <span className="truncate">
            {categoryMeta(key).label}
            {accountName && <> · {accountName}</>}
          </span>
        </p>
      </div>
      <div className="text-right shrink-0">
        {/* Plaid: positive = money out. Flip so inflows read as + */}
        <Money value={-t.amount} signed className={cn('font-bold', inflow ? 'text-positive' : 'text-ink')} />
        {t.pending && <p className="eyebrow text-[10px] text-warn mt-0.5">Pending</p>}
      </div>
    </>
  );

  return (
    <li>
      {onSelect ? (
        <button onClick={() => onSelect(t)} className="w-full text-left flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-sunken transition-colors">
          {content}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3">{content}</div>
      )}
    </li>
  );
}

// Groups transactions under day headers ("Today", "Yesterday", "Mon, Sep 29")
export function TransactionList({ transactions, accountName, rules, onSelect, emptyText = 'No transactions found.' }: {
  transactions: Txn[];
  rules?: TxnRules;
  accountName?: (accountId: string) => string | undefined;
  onSelect?: (t: Txn) => void;
  emptyText?: string;
}) {
  if (transactions.length === 0) {
    return <p className="p-10 text-center text-muted font-medium">{emptyText}</p>;
  }

  const groups: { day: string; items: Txn[] }[] = [];
  for (const t of transactions) {
    const last = groups[groups.length - 1];
    if (last?.day === t.date) last.items.push(t);
    else groups.push({ day: t.date, items: [t] });
  }

  return (
    <div>
      {groups.map(g => (
        <section key={g.day}>
          <h4 className="sticky top-0 z-[1] bg-sunken/95 backdrop-blur px-4 sm:px-5 py-1.5 text-xs font-bold text-muted border-y border-line">
            {friendlyDay(g.day)}
          </h4>
          <ul className="divide-y divide-line">
            {g.items.map(t => (
              <TransactionRow key={t.transaction_id} t={t} rules={rules} onSelect={onSelect} accountName={accountName?.(t.account_id)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
