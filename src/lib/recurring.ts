import { categoryOf, dayKey, displayName, merchantKey, parseDay, type Txn } from './finance';
import type { TxnRules } from './transfers';

export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
export type RecurringKind = 'income' | 'bill' | 'subscription';

export type RecurringItem = {
  key: string;
  name: string;
  /** Spending group key (Plaid category or "xfer:<type>") for the icon */
  groupKey: string;
  logo_url: string | null;
  account_id: string;
  kind: RecurringKind;
  frequency: Frequency;
  /** Most recent amount (always positive) */
  amount: number;
  /** Amounts vary between charges (e.g. a utility bill) */
  variable: boolean;
  lastDate: string;
  nextDate: string;
  occurrences: number;
  /** Normalized to a monthly cost, for totals */
  monthly: number;
  /** A fixed-price charge that just changed */
  priceChange: { from: number; to: number } | null;
};

const FREQUENCIES: { id: Frequency; days: number; tolerance: number }[] = [
  { id: 'weekly', days: 7, tolerance: 2 },
  { id: 'biweekly', days: 14, tolerance: 3 },
  { id: 'monthly', days: 30.44, tolerance: 5 },
  { id: 'quarterly', days: 91.3, tolerance: 12 },
  { id: 'yearly', days: 365.25, tolerance: 25 },
];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly',
};

// Money moving between your own accounts isn't a bill or a subscription
const SKIP_TRANSFER_KINDS = new Set(['internal', 'credit_card', 'savings', 'investments']);
const BILL_DETAIL = /RENT|UTILIT|INSURANCE|MORTGAGE|LOAN|TELECOM|INTERNET|PHONE|GAS_AND_ELECTRIC|WATER/;

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / DAY_MS);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function addInterval(day: string, freq: (typeof FREQUENCIES)[number]) {
  const d = parseDay(day);
  if (freq.id === 'monthly' || freq.id === 'quarterly' || freq.id === 'yearly') {
    // Same day of the month, clamped for short months (Jan 31 → Feb 28)
    const months = freq.id === 'monthly' ? 1 : freq.id === 'quarterly' ? 3 : 12;
    const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(d.getDate(), lastDay));
    return dayKey(target);
  }
  d.setDate(d.getDate() + freq.days);
  return dayKey(d);
}

export function detectRecurring(txns: Txn[], rules: TxnRules, dismissed: string[] = [], today = new Date()): RecurringItem[] {
  const todayKey = dayKey(today);
  const skip = new Set(dismissed);

  // Group posted charges and income by merchant
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.pending) continue;
    const kind = rules.kind(t);
    if (kind && SKIP_TRANSFER_KINDS.has(kind)) continue;
    const isIncome = t.amount < 0 && categoryOf(t) === 'INCOME';
    if (t.amount < 0 && !isIncome) continue; // refunds and other inflows
    const key = `${isIncome ? 'in' : 'out'}:${merchantKey(t)}`;
    if (skip.has(key)) continue;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const items: RecurringItem[] = [];
  for (const [key, list] of groups) {
    // One entry per day (several same-day charges from one merchant count once)
    const byDay = new Map<string, number>();
    for (const t of list) byDay.set(t.date, (byDay.get(t.date) ?? 0) + Math.abs(t.amount));
    const days = [...byDay.keys()].sort();
    if (days.length < 2) continue;

    const gaps = days.slice(1).map((d, i) => daysBetween(days[i], d));
    const typical = median(gaps);
    const freq = FREQUENCIES.find(f => Math.abs(typical - f.days) <= f.tolerance);
    if (!freq) continue;
    // Yearly needs 2 charges; everything else needs 3 so a coincidence doesn't count
    if (days.length < (freq.id === 'yearly' ? 2 : 3)) continue;
    const regular = gaps.filter(g => Math.abs(g - freq.days) <= freq.tolerance * 1.5).length;
    if (regular / gaps.length < 0.7) continue;

    const amounts = days.map(d => byDay.get(d)!);
    const recent = amounts.slice(-4);
    const mid = median(recent);
    const variable = (Math.max(...recent) - Math.min(...recent)) / mid > 0.2;

    const sample = list[list.length - 1];
    const detailed = sample.personal_finance_category?.detailed ?? '';
    const transferKind = rules.kind(sample);
    const isIncome = key.startsWith('in:');
    const isBill = BILL_DETAIL.test(detailed) || categoryOf(sample) === 'RENT_AND_UTILITIES' ||
      transferKind === 'mortgage' || transferKind === 'loans' || transferKind === 'bnpl';
    const kind: RecurringKind = isIncome ? 'income' : isBill ? 'bill' : 'subscription';
    // Repeated shopping with changing totals (groceries, gas) is a habit, not a subscription
    if (kind === 'subscription' && variable) continue;

    const lastDate = days[days.length - 1];
    let nextDate = addInterval(lastDate, freq);
    // Skip ahead if a charge was simply missed, but drop it if it seems to have stopped
    let missed = 0;
    while (daysBetween(nextDate, todayKey) > freq.tolerance && missed < 1) {
      nextDate = addInterval(nextDate, freq);
      missed++;
    }
    if (daysBetween(nextDate, todayKey) > freq.tolerance) continue;

    const last = amounts[amounts.length - 1];
    const prev = amounts[amounts.length - 2];
    const prevStable = amounts.length >= 3 && Math.abs(amounts[amounts.length - 3] - prev) < 0.01;
    const priceChange = !variable && prevStable && Math.abs(last - prev) > Math.max(0.5, prev * 0.02)
      ? { from: prev, to: last } : null;

    items.push({
      key,
      name: displayName(sample),
      groupKey: rules.groupKey(sample),
      logo_url: sample.logo_url,
      account_id: sample.account_id,
      kind,
      frequency: freq.id,
      amount: last,
      variable,
      lastDate,
      nextDate,
      occurrences: days.length,
      monthly: (variable ? mid : last) * (30.44 / freq.days),
      priceChange,
    });
  }

  return items.sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}

// Every expected charge between two days (weekly items can land several times)
export function projectOccurrences(items: RecurringItem[], start: string, end: string) {
  const out: { date: string; item: RecurringItem }[] = [];
  for (const item of items) {
    const freq = FREQUENCIES.find(f => f.id === item.frequency)!;
    // Walk back from the next date to cover the start of the window, then forward
    let d = item.nextDate;
    for (let i = 0; i < 60 && d > start; i++) {
      const back = parseDay(d);
      if (freq.id === 'monthly' || freq.id === 'quarterly' || freq.id === 'yearly') {
        back.setMonth(back.getMonth() - (freq.id === 'monthly' ? 1 : freq.id === 'quarterly' ? 3 : 12));
      } else {
        back.setDate(back.getDate() - freq.days);
      }
      d = dayKey(back);
    }
    for (let i = 0; i < 60 && d <= end; i++) {
      if (d >= start && d >= item.lastDate) out.push({ date: d, item });
      d = addInterval(d, freq);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
