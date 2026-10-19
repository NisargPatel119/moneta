'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ASSET_KINDS, ASSET_KIND_META, formatMoney, friendlyDay, type AssetKind, type ManualAsset } from '@/lib/finance';
import { Sheet, cn } from './ui';

export type AssetDraft = { name: string; kind: AssetKind; value: number; annual_rate: number | null; notes: string | null };

// Add or edit something Plaid can't see. Remount per asset (key) so the form starts fresh.
export function AssetEditor({ asset, onClose, onSave, onDelete }: {
  /** 'new' to add one, an asset to edit, null when closed */
  asset: ManualAsset | 'new' | null;
  onClose: () => void;
  onSave: (draft: AssetDraft, id: number | null) => Promise<string | null>;
  onDelete: (asset: ManualAsset) => Promise<void>;
}) {
  const existing = asset && asset !== 'new' ? asset : null;
  const [kind, setKind] = useState<AssetKind>(existing?.kind ?? 'real_estate');
  const [name, setName] = useState(existing?.name ?? '');
  // Editing shows today's estimate; saving a different number resets the estimate's starting point
  const [value, setValue] = useState(existing ? String(existing.value) : '');
  const [rate, setRate] = useState(existing ? String(existing.annual_rate ?? '') : String(ASSET_KIND_META.real_estate.defaultRate ?? ''));
  const [rateTouched, setRateTouched] = useState(!!existing);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!asset) return null;

  const pickKind = (k: AssetKind) => {
    setKind(k);
    // Suggest a typical yearly change until the user sets their own
    if (!rateTouched) setRate(String(ASSET_KIND_META[k].defaultRate ?? ''));
  };

  const numericValue = Number(value.replace(/[$,\s]/g, ''));
  const valid = name.trim() && value.trim() && Number.isFinite(numericValue) && numericValue >= 0;

  async function save() {
    if (!valid) return;
    setSaving(true);
    setError(null);
    const draft: AssetDraft = {
      name: name.trim(),
      kind,
      value: numericValue,
      annual_rate: rate.trim() === '' ? null : Number(rate),
      notes: notes.trim() || null,
    };
    // Unchanged value: don't restart the yearly drift from today
    const err = await onSave(draft, existing?.id ?? null);
    setSaving(false);
    if (err) setError(err);
    else onClose();
  }

  const rateNum = Number(rate);
  return (
    <Sheet
      open
      z="z-40"
      onClose={onClose}
      title={existing ? 'Edit asset' : 'Add an asset'}
      subtitle="For things your bank can't see. It counts toward your net worth."
      footer={
        <div className="flex items-center justify-between gap-3">
          {existing ? (
            <button
              onClick={async () => {
                if (!window.confirm(`Remove ${existing.name}? It will also disappear from your net worth history.`)) return;
                setSaving(true);
                await onDelete(existing);
                setSaving(false);
                onClose();
              }}
              disabled={saving}
              className="flex items-center gap-1.5 text-sm font-semibold text-negative hover:underline"
            >
              <Trash2 size={15} /> Remove
            </button>
          ) : <span />}
          <button
            onClick={save}
            disabled={!valid || saving}
            className="bg-accent text-on-accent px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-accent-strong disabled:opacity-40"
          >
            {saving ? 'Saving…' : existing ? 'Save' : 'Add asset'}
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-4">
        <div>
          <span className="eyebrow text-muted">Type</span>
          <div className="grid grid-cols-4 gap-2 mt-1.5">
            {ASSET_KINDS.map(k => {
              const meta = ASSET_KIND_META[k];
              const Icon = meta.icon;
              return (
                <button
                  key={k}
                  onClick={() => pickKind(k)}
                  aria-pressed={kind === k}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs font-semibold transition-colors',
                    kind === k ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:bg-sunken'
                  )}
                >
                  <Icon size={18} />
                  {meta.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-faint mt-1.5">{ASSET_KIND_META[kind].hint}</p>
        </div>

        <label className="block">
          <span className="eyebrow text-muted">Name</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={80}
            placeholder={kind === 'real_estate' ? 'Home' : kind === 'vehicle' ? '2021 Honda CR-V' : 'Name'}
            className="mt-1.5 w-full bg-sunken border border-line rounded-xl px-3.5 py-2.5 text-[16px] sm:text-sm outline-none focus:ring-2 focus:ring-accent focus:bg-surface"
          />
        </label>

        <label className="block">
          <span className="eyebrow text-muted">Current value</span>
          <div className="relative mt-1.5">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
            <input
              value={value}
              onChange={e => setValue(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="w-full bg-sunken border border-line rounded-xl pl-7 pr-3.5 py-2.5 text-[16px] sm:text-sm tabular-nums outline-none focus:ring-2 focus:ring-accent focus:bg-surface"
            />
          </div>
          {existing?.annual_rate && (
            <span className="text-[11px] text-faint mt-1 block">
              You entered {formatMoney(existing.entered_value, { whole: true })} on {friendlyDay(existing.value_date)}; this is today&apos;s estimate.
            </span>
          )}
        </label>

        <label className="block">
          <span className="eyebrow text-muted">Change per year</span>
          <div className="relative mt-1.5">
            <input
              value={rate}
              onChange={e => { setRate(e.target.value); setRateTouched(true); }}
              inputMode="decimal"
              placeholder="0"
              className="w-full bg-sunken border border-line rounded-xl pl-3.5 pr-8 py-2.5 text-[16px] sm:text-sm tabular-nums outline-none focus:ring-2 focus:ring-accent focus:bg-surface"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">%</span>
          </div>
          <span className="text-[11px] text-faint mt-1 block">
            {rate.trim() === '' || rateNum === 0
              ? 'The value stays the same until you update it.'
              : `Moneta estimates the value going ${rateNum > 0 ? 'up' : 'down'} ${Math.abs(rateNum)}% a year (homes often gain ~3%, cars lose ~15%). Update it any time.`}
          </span>
        </label>

        <label className="block">
          <span className="eyebrow text-muted">Note</span>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="e.g. Zillow estimate, appraisal date…"
            className="mt-1.5 w-full resize-none bg-sunken border border-line rounded-xl px-3.5 py-2.5 text-[16px] sm:text-sm outline-none focus:ring-2 focus:ring-accent focus:bg-surface"
          />
        </label>

        {error && <p className="text-sm font-semibold text-negative" role="alert">{error}</p>}
      </div>
    </Sheet>
  );
}
