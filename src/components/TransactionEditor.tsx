'use client';
import { useEffect, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import {
  CATEGORIES, EDITABLE_CATEGORIES, categoryMeta, friendlyDay, merchantKey, type CategoryRule, type Txn,
} from '@/lib/finance';
import { Money, TransactionIcon, cn } from './ui';

// Only the fields present are changed (null means "back to automatic" / "clear")
export type TxnEdit = {
  category?: string | null;
  name?: string | null;
  notes?: string | null;
  applyToMerchant?: boolean;
};

export function TransactionEditor({ txn, rule, accountName, onClose, onSave, onDeleteRule }: {
  txn: Txn | null;
  /** The merchant rule currently applied to this transaction, if any */
  rule: CategoryRule | null;
  accountName?: string;
  onClose: () => void;
  onSave: (txn: Txn, edit: TxnEdit) => Promise<void>;
  onDeleteRule: (rule: CategoryRule) => Promise<void>;
}) {
  // Each transaction remounts this form (see the key in page.tsx), so initial state comes from props
  const plaidCategory = txn?.personal_finance_category?.primary ?? null;
  const [category, setCategory] = useState<string>(txn?.user_category ?? plaidCategory ?? 'GENERAL_MERCHANDISE');
  const [name, setName] = useState(txn?.user_name ?? '');
  const [notes, setNotes] = useState(txn?.notes ?? '');
  const [applyToMerchant, setApplyToMerchant] = useState(txn?.edited !== 'manual');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!txn) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [txn, onClose]);

  if (!txn) return null;

  const bankName = txn.merchant_name || txn.name;
  const changedCategory = category !== (txn.user_category ?? plaidCategory);
  const changedName = (name.trim() || null) !== (txn.user_name ?? null);
  const changedNotes = (notes.trim() || null) !== (txn.notes ?? null);
  const dirty = changedCategory || changedName || changedNotes;
  const merchant = merchantKey(txn);

  function buildEdit(): TxnEdit {
    const edit: TxnEdit = {};
    if (changedNotes) edit.notes = notes.trim() || null;
    if ((changedCategory || changedName) && applyToMerchant) {
      // A rule carries the whole look of the merchant: its category (if not Plaid's) and name
      edit.applyToMerchant = true;
      edit.category = category !== plaidCategory ? category : null;
      edit.name = name.trim() || null;
    } else {
      if (changedCategory) edit.category = category;
      if (changedName) edit.name = name.trim() || null;
    }
    return edit;
  }

  async function save(edit: TxnEdit) {
    setSaving(true);
    try {
      await onSave(txn!, edit);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="txn-editor-title">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-start gap-3 p-5 border-b border-line">
          <TransactionIcon t={txn} categoryKey={category} />
          <div className="flex-1 min-w-0">
            <h2 id="txn-editor-title" className="font-bold text-ink truncate">{name.trim() || bankName}</h2>
            <p className="text-xs text-muted mt-0.5 truncate">
              {friendlyDay(txn.date)}{accountName && <> · {accountName}</>}{txn.pending && ' · Pending'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <Money value={-txn.amount} signed className={cn('font-bold', txn.amount < 0 ? 'text-positive' : 'text-ink')} />
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-2 ml-1 rounded-xl text-muted hover:bg-sunken"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          <label className="block">
            <span className="eyebrow text-muted">Name</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={bankName}
              maxLength={120}
              className="mt-1.5 w-full bg-sunken border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent focus:bg-surface"
            />
            <span className="text-[11px] text-faint mt-1 block">From your bank: {txn.name}</span>
          </label>

          <label className="block">
            <span className="eyebrow text-muted">Category</span>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="mt-1.5 w-full bg-sunken border border-line rounded-xl px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-accent"
            >
              {EDITABLE_CATEGORIES.map(key => (
                <option key={key} value={key}>{CATEGORIES[key].label}</option>
              ))}
            </select>
            {plaidCategory && category !== plaidCategory && (
              <span className="text-[11px] text-faint mt-1 block">Automatic: {categoryMeta(plaidCategory).label}</span>
            )}
          </label>

          <label className="block">
            <span className="eyebrow text-muted">Note</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Add a note…"
              className="mt-1.5 w-full resize-none bg-sunken border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent focus:bg-surface"
            />
          </label>

          {(changedCategory || changedName) && (
            <label className="flex items-start gap-3 rounded-2xl bg-accent-soft p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={applyToMerchant}
                onChange={e => setApplyToMerchant(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[var(--accent)]"
              />
              <span className="text-sm text-accent">
                <span className="font-semibold">Always do this for “{merchant}”</span>
                <span className="block text-xs text-accent/80 mt-0.5">Applies to past and future transactions from this merchant.</span>
              </span>
            </label>
          )}

          {rule && (
            <div className="flex items-center justify-between gap-3 text-xs text-muted bg-sunken rounded-xl p-3">
              <span>A rule for “{rule.merchant_key}” is setting this transaction.</span>
              <button
                onClick={async () => { setSaving(true); try { await onDeleteRule(rule); onClose(); } finally { setSaving(false); } }}
                disabled={saving}
                className="shrink-0 font-semibold text-negative hover:underline"
              >
                Remove rule
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 pb-5">
          {txn.edited === 'manual' ? (
            <button
              onClick={() => save({ category: null, name: null })}
              disabled={saving}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
            >
              <RotateCcw size={15} /> Reset to automatic
            </button>
          ) : <span />}
          <button
            onClick={() => save(buildEdit())}
            disabled={!dirty || saving}
            className="bg-accent text-on-accent px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-accent-strong disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
