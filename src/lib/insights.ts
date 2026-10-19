import {
  NET_WORTH_BUCKETS, categoryMeta, dayKey, inRange, isIncome, merchantKey, parseDay, spendingByCategory, sumIncome, sumSpending,
  type NetWorthBucket, type NetWorthPoint, type Txn,
} from './finance';
import type { TxnRules } from './transfers';
import type { RecurringItem } from './recurring';

// ---------- What changed your net worth ----------

export type BucketChange = {
  bucket: NetWorthBucket;
  /** Effect on net worth: paying down a card is positive, owing more is negative */
  effect: number;
};

export type NetWorthChange = {
  fromDate: string;
  toDate: string;
  change: number;
  buckets: BucketChange[];
  /** Money you moved into investment accounts from linked cash accounts in the period */
  contributions: number;
};

const isDebt = (b: NetWorthBucket) => b === 'credit' || b === 'loans';

// Compares the last recorded day on or before `fromDay` with the last day on or before `toDay`.
// If history starts after `fromDay`, it compares from the first recorded day instead.
export function netWorthChange(
  history: NetWorthPoint[], fromDay: string, toDay: string, txns: Txn[], rules: TxnRules,
): NetWorthChange | null {
  const upTo = history.filter(p => p.date <= toDay);
  const end = upTo[upTo.length - 1];
  if (!end) return null;
  const start = [...upTo].reverse().find(p => p.date <= fromDay) ?? upTo[0];
  if (start === end) return null;

  const buckets = NET_WORTH_BUCKETS.map(bucket => {
    const delta = (end.byBucket?.[bucket] ?? 0) - (start.byBucket?.[bucket] ?? 0);
    return { bucket, effect: isDebt(bucket) ? -delta : delta };
  }).filter(b => Math.abs(b.effect) >= 1);

  const range = { start: start.date, end: end.date };
  const contributions = txns
    .filter(t => t.date > range.start && t.date <= range.end && t.amount > 0 && rules.kind(t) === 'investments')
    .reduce((s, t) => s + t.amount, 0);

  return { fromDate: start.date, toDate: end.date, change: end.netWorth - start.netWorth, buckets, contributions };
}

// ---------- Monthly recap ----------

export type CategoryShift = { key: string; label: string; total: number; average: number; diff: number };

export type MonthlyRecap = {
  /** "YYYY-MM" */
  month: string;
  label: string;
  complete: boolean;
  income: number;
  spent: number;
  saved: number;
  /** saved ÷ income, or null without income */
  savingsRate: number | null;
  previous: { income: number; spent: number; saved: number } | null;
  /** Categories that moved most vs. the average of the 3 months before */
  shifts: CategoryShift[];
  biggest: Txn[];
  newRecurring: RecurringItem[];
  priceChanges: RecurringItem[];
  netWorth: NetWorthChange | null;
};

export function monthKey(offset: number) {
  const now = new Date();
  return dayKey(new Date(now.getFullYear(), now.getMonth() + offset, 1)).slice(0, 7);
}

export function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number);
  return { start: dayKey(new Date(y, m - 1, 1)), end: dayKey(new Date(y, m, 0)) };
}

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number);
  return dayKey(new Date(y, m - 1 + by, 1)).slice(0, 7);
}

export function monthLabel(month: string, opts: { year?: boolean } = {}) {
  return parseDay(`${month}-01`).toLocaleDateString('en-US', { month: 'long', ...(opts.year ? { year: 'numeric' } : {}) });
}

// Months that have any transactions, newest first
export function monthsWithData(txns: Txn[]) {
  return [...new Set(txns.map(t => t.date.slice(0, 7)))].sort().reverse();
}

export function buildRecap(
  month: string, txns: Txn[], rules: TxnRules, recurring: RecurringItem[], history: NetWorthPoint[],
): MonthlyRecap {
  const range = monthBounds(month);
  const inMonth = txns.filter(t => inRange(t, range));
  const income = sumIncome(inMonth);
  const spent = sumSpending(inMonth, rules);

  const prevRange = monthBounds(shiftMonth(month, -1));
  const prevTxns = txns.filter(t => inRange(t, prevRange));
  const hasPrev = prevTxns.length > 0;
  const prevIncome = sumIncome(prevTxns);
  const prevSpent = sumSpending(prevTxns, rules);

  // Compare each category to its average over the 3 months before (only months we have data for)
  const priorMonths = [1, 2, 3].map(n => shiftMonth(month, -n));
  const priorTotals = priorMonths
    .map(m => txns.filter(t => inRange(t, monthBounds(m))))
    .filter(list => list.length > 0)
    .map(list => new Map(spendingByCategory(list, rules).map(c => [c.key, c.total])));
  const current = spendingByCategory(inMonth, rules);
  const keys = new Set([...current.map(c => c.key), ...priorTotals.flatMap(m => [...m.keys()])]);
  const shifts: CategoryShift[] = priorTotals.length === 0 ? [] : [...keys].map(key => {
    const total = current.find(c => c.key === key)?.total ?? 0;
    const average = priorTotals.reduce((s, m) => s + (m.get(key) ?? 0), 0) / priorTotals.length;
    return { key, label: categoryMeta(key).label, total, average, diff: total - average };
  }).filter(s => Math.abs(s.diff) >= 25 && Math.abs(s.diff) >= s.average * 0.15)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 4);

  // One-off purchases: rent and other recurring bills would top this list every month
  const recurringKeys = new Set(recurring.map(r => r.key));
  const biggest = inMonth
    .filter(t => rules.isSpending(t) && !recurringKeys.has(merchantKey(t)))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  // A recurring charge is new if its merchant never appeared before this month
  const firstSeen = new Map<string, string>();
  for (const t of txns) {
    const key = merchantKey(t);
    const seen = firstSeen.get(key);
    if (!seen || t.date < seen) firstSeen.set(key, t.date);
  }
  const newRecurring = recurring.filter(r => r.kind !== 'income' && inRange({ date: firstSeen.get(r.key) ?? '' } as Txn, range));
  const priceChanges = recurring.filter(r => r.priceChange && inRange({ date: r.lastDate } as Txn, range));

  const today = dayKey(new Date());
  return {
    month,
    label: monthLabel(month, { year: month.slice(0, 4) !== today.slice(0, 4) }),
    complete: range.end < today,
    income,
    spent,
    saved: income - spent,
    savingsRate: income > 0 ? (income - spent) / income : null,
    previous: hasPrev ? { income: prevIncome, spent: prevSpent, saved: prevIncome - prevSpent } : null,
    shifts,
    biggest,
    newRecurring,
    priceChanges,
    netWorth: netWorthChange(history, prevRange.end, range.end, txns, rules),
  };
}

// The transactions behind a recap number, for drill-downs
export function recapTransactions(month: string, txns: Txn[], rules: TxnRules, what: 'income' | 'spent' | { category: string }) {
  const inMonth = txns.filter(t => inRange(t, monthBounds(month)));
  if (what === 'income') return inMonth.filter(isIncome);
  if (what === 'spent') return inMonth.filter(t => rules.isSpending(t));
  return inMonth.filter(t => rules.groupKey(t) === what.category);
}
