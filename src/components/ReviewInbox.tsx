'use client';
import { Check, CheckCheck, PartyPopper } from 'lucide-react';
import { CATEGORIES, EDITABLE_CATEGORIES, categoryMeta, displayName, friendlyDay, type Txn } from '@/lib/finance';
import type { TxnRules } from '@/lib/transfers';
import { Money, Sheet, TransactionIcon, cn } from './ui';

// New transactions waiting for a quick look: confirm the category with one tap, or fix it
export function ReviewInbox({ open, onClose, txns, rules, accountName, onApprove, onCategory, onSelect }: {
  open: boolean;
  onClose: () => void;
  txns: Txn[];
  rules: TxnRules;
  accountName: (id: string) => string | undefined;
  onApprove: (txns: Txn[]) => void;
  onCategory: (t: Txn, category: string) => void;
  onSelect: (t: Txn) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="To review"
      subtitle={txns.length > 0
        ? `${txns.length} new transaction${txns.length === 1 ? '' : 's'}. Check the category, then tick it off.`
        : undefined}
      footer={txns.length > 1 ? (
        <button
          onClick={() => onApprove(txns)}
          className="w-full flex items-center justify-center gap-2 bg-accent text-on-accent py-3 rounded-xl font-semibold hover:bg-accent-strong"
        >
          <CheckCheck size={18} /> Mark all {txns.length} as reviewed
        </button>
      ) : undefined}
    >
      {txns.length === 0 ? (
        <div className="p-10 text-center">
          <PartyPopper className="mx-auto text-accent" size={32} />
          <p className="font-display text-3xl mt-3">All caught up</p>
          <p className="text-sm text-muted mt-1">New transactions will show up here as your banks post them.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {txns.map(t => <ReviewRow key={t.transaction_id} t={t} rules={rules} accountName={accountName(t.account_id)} onApprove={() => onApprove([t])} onCategory={c => onCategory(t, c)} onSelect={() => onSelect(t)} />)}
        </ul>
      )}
    </Sheet>
  );
}

function ReviewRow({ t, rules, accountName, onApprove, onCategory, onSelect }: {
  t: Txn;
  rules: TxnRules;
  accountName?: string;
  onApprove: () => void;
  onCategory: (category: string) => void;
  onSelect: () => void;
}) {
  const key = rules.groupKey(t);
  // Transfers are grouped by type ("xfer:…"); the picker shows the underlying category instead
  const current = t.user_category ?? t.personal_finance_category?.primary ?? 'GENERAL_MERCHANDISE';
  return (
    <li className="px-4 sm:px-5 py-3.5 space-y-2.5">
      <button onClick={onSelect} className="w-full flex items-center gap-3 text-left">
        <TransactionIcon t={t} categoryKey={key} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink truncate">{displayName(t)}</p>
          <p className="text-xs text-muted font-medium truncate mt-0.5">
            {friendlyDay(t.date)}{accountName && <> · {accountName}</>}{t.pending && ' · Pending'}
          </p>
        </div>
        <Money value={-t.amount} signed className={cn('font-bold shrink-0', t.amount < 0 ? 'text-positive' : 'text-ink')} />
      </button>
      <div className="flex items-center gap-2 pl-[3.25rem]">
        <select
          value={CATEGORIES[current] ? current : 'GENERAL_MERCHANDISE'}
          onChange={e => onCategory(e.target.value)}
          aria-label={`Category for ${displayName(t)}`}
          className="flex-1 min-w-0 bg-sunken border border-line rounded-lg px-2.5 py-2 text-[16px] sm:text-sm font-medium outline-none focus:ring-2 focus:ring-accent"
        >
          {EDITABLE_CATEGORIES.map(k => <option key={k} value={k}>{categoryMeta(k).label}</option>)}
        </select>
        <button
          onClick={onApprove}
          aria-label={`Mark ${displayName(t)} as reviewed`}
          className="shrink-0 flex items-center gap-1.5 bg-positive-soft text-positive font-semibold text-sm px-3 py-2 rounded-lg hover:brightness-95"
        >
          <Check size={16} /> Looks good
        </button>
      </div>
    </li>
  );
}
