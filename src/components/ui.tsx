'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Type, X } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { categoryMeta, categoryOf, formatMoney, type Txn } from '@/lib/finance';

// A soft background wash of any color (hex or CSS variable), for icon chips
export function tint(color: string, percent = 12) {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

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
  return <div className={cn('bg-surface rounded-2xl border border-line', className)}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-muted eyebrow">{children}</h3>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-sunken', className)} />;
}

// ---------- Transaction avatar: merchant logo, falling back to a category icon ----------

export function TransactionIcon({ t, categoryKey }: { t: Txn; categoryKey?: string }) {
  const meta = categoryMeta(categoryKey ?? categoryOf(t));
  const Icon = meta.icon;
  if (t.logo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={t.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover border border-line shrink-0 bg-surface" />;
  }
  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
      style={{ backgroundColor: tint(meta.color), color: meta.color }}
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
        className="w-10 h-10 flex items-center justify-center rounded-xl text-muted hover:bg-sunken hover:text-ink transition-colors"
      >
        <Type size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-30 w-64 bg-surface rounded-2xl border border-line shadow-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="eyebrow text-muted">Text size</p>
            {size !== TEXT_SIZE_DEFAULT && (
              <button onClick={() => apply(TEXT_SIZE_DEFAULT)} className="text-xs font-semibold text-accent">Reset</button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-bold text-muted">A</span>
            <input
              type="range"
              min={TEXT_SIZE_MIN}
              max={TEXT_SIZE_MAX}
              step={1}
              value={size}
              onChange={e => apply(Number(e.target.value))}
              aria-label="Text size"
              className="flex-1 accent-[var(--accent)]"
            />
            <span className="text-[19px] font-bold text-muted">A</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Brand ----------

// The rosette coin mark (see BrandMark), in theme colors so it flips in dark mode
export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 rounded-full ring-1 ring-offset-2 ring-offset-canvas ring-line-strong">
      <BrandMark size={size === 'lg' ? 56 : 40} ink="var(--ink)" paper="var(--canvas)" />
    </span>
  );
}

// ---------- Sheet: a bottom sheet on phones, a centered dialog on larger screens ----------

export function Sheet({ open, onClose, title, subtitle, children, footer, wide, z = 'z-30' }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Stacking: the transaction editor (z-40) opens on top of other sheets (z-30) */
  z?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={cn('fixed inset-0 flex items-end sm:items-center justify-center', z)} role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={cn(
        'relative bg-surface w-full max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-xl pb-[env(safe-area-inset-bottom)]',
        wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
      )}>
        <div className="flex items-start gap-3 p-5 border-b border-line shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-3xl tracking-tight leading-tight">{title}</h2>
            {subtitle && <div className="text-sm text-muted mt-1">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-2 rounded-xl text-muted hover:bg-sunken"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0">{children}</div>
        {footer && <div className="border-t border-line p-4 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

// A number you can tap to see what's behind it
export function DrillButton({ onClick, children, className, label }: {
  onClick: () => void; children: ReactNode; className?: string; label?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn('text-left rounded-lg -m-1 p-1 hover:bg-sunken transition-colors underline decoration-dotted decoration-line-strong underline-offset-4', className)}
    >
      {children}
    </button>
  );
}

// ---------- Toast with an optional Undo ----------

export type ToastMessage = { text: string; undo?: () => void };

export function Toast({ toast, onDone }: { toast: ToastMessage | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onDone, 6000);
    return () => clearTimeout(id);
  }, [toast, onDone]);
  if (!toast) return null;
  return (
    <div className="fixed inset-x-0 bottom-24 md:bottom-auto md:top-20 z-50 flex justify-center px-4 pointer-events-none">
      <div role="status" className="pointer-events-auto flex items-center gap-4 bg-ink text-canvas rounded-xl px-4 py-3 shadow-lg text-sm font-medium max-w-md">
        <span>{toast.text}</span>
        {toast.undo && (
          <button onClick={() => { toast.undo!(); onDone(); }} className="font-bold underline shrink-0">Undo</button>
        )}
      </div>
    </div>
  );
}
