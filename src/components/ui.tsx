'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Type } from 'lucide-react';
import type { Transaction } from 'plaid';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { categoryMeta, categoryOf, formatMoney } from '@/lib/finance';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// ---------- Per-device preferences saved in localStorage ----------

const prefListeners = new Set<() => void>();
const prefFallback = new Map<string, string>(); // used when storage is blocked (e.g. some private modes)

function subscribePrefs(onChange: () => void) {
  prefListeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    prefListeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readPref(key: string) {
  try { return localStorage.getItem(key) ?? prefFallback.get(key) ?? null; } catch { return prefFallback.get(key) ?? null; }
}

// Server render (and hydration) sees null, then the saved value, so there's no hydration mismatch
export function usePref(key: string): [string | null, (value: string) => void] {
  const value = useSyncExternalStore(subscribePrefs, () => readPref(key), () => null);
  const set = useCallback((next: string) => {
    prefFallback.set(key, next);
    try { localStorage.setItem(key, next); } catch {}
    prefListeners.forEach(l => l());
  }, [key]);
  return [value, set];
}

// ---------- Privacy mode: blur every amount on screen ----------

const PrivacyContext = createContext({ hidden: false, toggle: () => {} });

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = usePref('ws_hide_amounts');
  const hidden = saved === '1';
  const toggle = () => setSaved(hidden ? '0' : '1');
  return <PrivacyContext.Provider value={{ hidden, toggle }}>{children}</PrivacyContext.Provider>;
}

export const usePrivacy = () => useContext(PrivacyContext);

export function Money({ value, whole, className, signed }: {
  value: number | null | undefined;
  whole?: boolean;
  className?: string;
  /** Show a leading + or − */
  signed?: boolean;
}) {
  const { hidden } = usePrivacy();
  const text = formatMoney(value == null ? value : signed ? Math.abs(value) : value, { whole });
  const sign = signed && value != null ? (value < 0 ? '−' : '+') : '';
  return (
    <span className={cn('tabular-nums transition-[filter]', hidden && 'blur-md select-none', className)}>
      {sign}{text}
    </span>
  );
}

// ---------- Layout primitives ----------

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('bg-white rounded-3xl border border-slate-200 shadow-sm', className)}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">{children}</h3>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-slate-200/70', className)} />;
}

// ---------- Transaction avatar: merchant logo, falling back to a category icon ----------

export function TransactionIcon({ t }: { t: Transaction }) {
  const meta = categoryMeta(categoryOf(t));
  const Icon = meta.icon;
  if (t.logo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={t.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0 bg-white" />;
  }
  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
      style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
    >
      <Icon size={18} />
    </div>
  );
}

// ---------- Text size: scales the root font size, so every rem-based size follows ----------

export const TEXT_SIZE_KEY = 'ws_text_size';
export const TEXT_SIZE_DEFAULT = 14;
const TEXT_SIZE_MIN = 12;
const TEXT_SIZE_MAX = 19;

export function TextSizeControl() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = usePref(TEXT_SIZE_KEY);
  const parsed = Number(saved);
  const size = parsed >= TEXT_SIZE_MIN && parsed <= TEXT_SIZE_MAX ? parsed : TEXT_SIZE_DEFAULT;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  // The <head> script in layout.tsx applies the saved size on page load; this handles live changes
  const apply = (next: number) => {
    document.documentElement.style.fontSize = `${next}px`;
    setSaved(String(next));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Text size"
        aria-label="Text size"
        aria-expanded={open}
        className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
      >
        <Type size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-30 w-64 bg-white rounded-2xl border border-slate-200 shadow-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Text size</p>
            {size !== TEXT_SIZE_DEFAULT && (
              <button onClick={() => apply(TEXT_SIZE_DEFAULT)} className="text-xs font-semibold text-blue-600">Reset</button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-bold text-slate-500">A</span>
            <input
              type="range"
              min={TEXT_SIZE_MIN}
              max={TEXT_SIZE_MAX}
              step={1}
              value={size}
              onChange={e => apply(Number(e.target.value))}
              aria-label="Text size"
              className="flex-1 accent-blue-600"
            />
            <span className="text-[19px] font-bold text-slate-500">A</span>
          </div>
        </div>
      )}
    </div>
  );
}
