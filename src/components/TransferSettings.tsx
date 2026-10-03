'use client';
import { useEffect } from 'react';
import { Trash2, X } from 'lucide-react';
import { categoryMeta, type CategoryRule, type Txn } from '@/lib/finance';
import { TRANSFER_META, TRANSFER_TYPES, type TransferRules, type TransferType, type TxnRules } from '@/lib/transfers';
import { Money, cn } from './ui';

export function TransferSettings({ open, onClose, transactions, txnRules, onChange, merchantRules, onDeleteRule }: {
  merchantRules: CategoryRule[];
  onDeleteRule: (rule: CategoryRule) => void;
  open: boolean;
  onClose: () => void;
  transactions: Txn[];
  txnRules: TxnRules;
  onChange: (rules: TransferRules) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // How much of the last 90 days each type covers, so the effect of a switch is clear
  const stats = new Map<TransferType, { count: number; out: number }>();
  for (const t of transactions) {
    const k = txnRules.kind(t);
    if (!k) continue;
    const s = stats.get(k) ?? { count: 0, out: 0 };
    s.count += 1;
    if (t.amount > 0) s.out += t.amount;
    stats.set(k, s);
  }

  const rules = txnRules.rules;
  const update = (type: TransferType, patch: Partial<TransferRules[TransferType]>) =>
    onChange({ ...rules, [type]: { ...rules[type], ...patch } });

  // Types that appear in the data first, then the rest
  const ordered = [...TRANSFER_TYPES].sort((a, b) => Number(!!stats.get(b)) - Number(!!stats.get(a)));

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="transfer-settings-title">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg max-h-[85dvh] flex flex-col rounded-t-3xl sm:rounded-3xl shadow-xl">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div>
            <h2 id="transfer-settings-title" className="font-bold text-slate-900 text-lg">Rules</h2>
            <p className="text-sm text-slate-500 mt-0.5">How Moneta treats transfers and specific merchants.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-2 rounded-xl text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <h3 className="px-5 pt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Transfers</h3>
        <p className="px-5 pt-1 text-xs text-slate-500">Hide transfers from your transactions and choose whether they count as spending.</p>
        <ul className="divide-y divide-slate-100">
          {ordered.map(type => {
            const meta = TRANSFER_META[type];
            const Icon = meta.icon;
            const s = stats.get(type);
            return (
              <li key={type} className={cn('p-5 flex gap-3', !s && 'opacity-60')}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900">{meta.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {s ? <>{s.count} in the last 90 days{s.out > 0 && <> · <Money value={s.out} whole /> out</>}</> : 'None in the last 90 days'}
                  </p>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3">
                    <Switch label="Hide from transactions" checked={rules[type].hide} onChange={v => update(type, { hide: v })} />
                    {type !== 'internal' && (
                      <Switch label="Count as spending" checked={rules[type].countAsSpending} onChange={v => update(type, { countAsSpending: v })} />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <h3 className="px-5 pt-5 text-xs font-bold uppercase tracking-wider text-slate-500 border-t border-slate-100">Merchant rules</h3>
        {merchantRules.length === 0 ? (
          <p className="px-5 pt-1 pb-6 text-xs text-slate-500">
            None yet. Tap any transaction, change its category or name, and keep “Always do this” checked to create one.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 pb-2">
            {merchantRules.map(r => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0 text-sm">
                  <p className="font-semibold text-slate-900 truncate">“{r.merchant_key}”</p>
                  <p className="text-xs text-slate-500 truncate">
                    {r.category && <>→ {categoryMeta(r.category).label}</>}
                    {r.category && r.rename && ' · '}
                    {r.rename && <>shown as “{r.rename}”</>}
                  </p>
                </div>
                <button onClick={() => onDeleteRule(r)} aria-label={`Delete rule for ${r.merchant_key}`} className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50">
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        </div>
      </div>
    </div>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative w-9 h-5 rounded-full transition-colors shrink-0', checked ? 'bg-blue-600' : 'bg-slate-300')}
      >
        <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
      </button>
      {label}
    </label>
  );
}
