import type { AccountBase } from 'plaid';
import type { HoldingRow } from './plaidData';
import { TRANSFER_META, type TransferRules, type TransferType, type TxnRules } from './transfers';
import {
  ArrowLeftRight, Banknote, Bitcoin, Briefcase, Car, Coffee, Film, Gem, HeartPulse, Home, Hammer,
  Landmark, Package, Plane, ReceiptText, Scissors, ShoppingBag, Wrench, CircleDollarSign,
  type LucideIcon,
} from 'lucide-react';

export type Account = AccountBase & { institution: string; item_id: string };

// A stored transaction, with the user's edits applied. Plaid convention: positive amount = money out.
export type Txn = {
  transaction_id: string;
  account_id: string;
  date: string;
  amount: number;
  name: string;
  merchant_name: string | null;
  pending: boolean;
  logo_url: string | null;
  personal_finance_category: { primary: string; detailed: string } | null;
  /** Category chosen by the user, or by one of their merchant rules */
  user_category: string | null;
  /** Display name chosen by the user, or by a merchant rule */
  user_name: string | null;
  notes: string | null;
  /** How the user's edits were applied, if any */
  edited: 'manual' | 'rule' | null;
  /** Checked off in the review inbox (or edited) */
  reviewed: boolean;
};

export type CategoryRule = { id: number; merchant_key: string; category: string | null; rename: string | null };

// Net worth split into the buckets that explain how it changed
export const NET_WORTH_BUCKETS = ['cash', 'investments', 'property', 'credit', 'loans'] as const;
export type NetWorthBucket = (typeof NET_WORTH_BUCKETS)[number];

export const BUCKET_LABELS: Record<NetWorthBucket, string> = {
  cash: 'Cash',
  investments: 'Investments',
  property: 'Property & other assets',
  credit: 'Credit cards',
  loans: 'Loans',
};

/** Which bucket an account type (or "manual" for a manual asset) belongs to */
export function bucketOf(type: string | null | undefined): NetWorthBucket {
  if (type === 'depository') return 'cash';
  if (type === 'investment') return 'investments';
  if (type === 'credit') return 'credit';
  if (type === 'loan') return 'loans';
  return 'property';
}

export type NetWorthPoint = {
  date: string;
  assets: number;
  liabilities: number;
  netWorth: number;
  /** Balance per bucket; credit and loans are amounts owed (positive) */
  byBucket: Record<NetWorthBucket, number>;
};

export function pointFromBuckets(date: string, byBucket: Record<NetWorthBucket, number>): NetWorthPoint {
  const liabilities = byBucket.credit + byBucket.loans;
  const assets = byBucket.cash + byBucket.investments + byBucket.property;
  return { date, assets, liabilities, netWorth: assets - liabilities, byBucket };
}

export type DashboardIssue = { item_id: string; code: string; message: string; institution?: string };

// One linked login at one institution (a Plaid "Item")
export type Connection = {
  item_id: string;
  institution: string;
  accountCount: number;
  lastSyncedAt: string | null;
  /** ok, or the Plaid error code that's blocking this connection */
  status: 'ok' | 'reconnect' | 'consent' | 'error';
  message?: string;
};

export const ASSET_KINDS = ['real_estate', 'vehicle', 'crypto', 'cash', 'investment', 'valuables', 'other'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_KIND_META: Record<AssetKind, { label: string; icon: LucideIcon; hint: string; defaultRate: number | null }> = {
  real_estate: { label: 'Real estate', icon: Home, hint: 'Home, rental, land', defaultRate: 3 },
  vehicle: { label: 'Vehicle', icon: Car, hint: 'Car, motorcycle, boat', defaultRate: -15 },
  crypto: { label: 'Crypto', icon: Bitcoin, hint: 'Coins in a wallet or an unlinked exchange', defaultRate: null },
  cash: { label: 'Cash', icon: Banknote, hint: 'Cash on hand, an unlinked bank', defaultRate: null },
  investment: { label: 'Investment', icon: Briefcase, hint: 'Private equity, startup shares, an unlinked account', defaultRate: null },
  valuables: { label: 'Valuables', icon: Gem, hint: 'Jewelry, art, collectibles', defaultRate: null },
  other: { label: 'Other', icon: Package, hint: 'Anything else you own', defaultRate: null },
};

export type ManualAsset = {
  id: number;
  name: string;
  kind: AssetKind;
  /** Today's estimated value: the entered value adjusted by annual_rate since value_date */
  value: number;
  /** What the user entered, and when */
  entered_value: number;
  value_date: string;
  /** Yearly change in percent (3 = +3%/yr, -15 = −15%/yr), or null to keep the value fixed */
  annual_rate: number | null;
  notes: string | null;
};

// Grows or shrinks a value by a yearly rate, compounded daily-ish, from one day to another
export function projectAssetValue(value: number, annualRate: number | null, fromDay: string, toDay: string) {
  if (!annualRate) return value;
  const years = Math.max(0, (parseDay(toDay).getTime() - parseDay(fromDay).getTime()) / (365.25 * 86_400_000));
  return Math.round(value * Math.pow(1 + annualRate / 100, years) * 100) / 100;
}

export type DashboardData = {
  linked: boolean;
  demo?: boolean;
  netWorth: number;
  assets: number;
  liabilities: number;
  accounts: Account[];
  transactions: Txn[];
  holdings: HoldingRow[];
  issues: DashboardIssue[];
  connections: Connection[];
  manualAssets: ManualAsset[];
  settings: { transferRules: TransferRules; dismissedRecurring: string[] };
  rules: CategoryRule[];
  history: NetWorthPoint[];
  fetchedAt?: string;
};

// ---------- Formatting ----------

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function formatMoney(value: number | null | undefined, opts: { whole?: boolean } = {}) {
  if (value == null) return '—';
  return (opts.whole ? usdWhole : usd).format(value);
}

export function formatCompact(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

// Plaid dates are "YYYY-MM-DD" in the account's local day. new Date("YYYY-MM-DD") parses as UTC,
// which shifts it to the previous day in US time zones, so build a local date instead.
export function parseDay(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function dayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function friendlyDay(day: string) {
  const date = parseDay(day);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return 'Today';
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

export function timeAgo(iso: string | undefined) {
  if (!iso) return '';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr ago`;
}

// ---------- Categories ----------

type CategoryMeta = { label: string; icon: LucideIcon; color: string };

export const CATEGORIES: Record<string, CategoryMeta> = {
  FOOD_AND_DRINK: { label: 'Food & Drink', icon: Coffee, color: '#f97316' },
  GENERAL_MERCHANDISE: { label: 'Shopping', icon: ShoppingBag, color: '#8b5cf6' },
  TRANSPORTATION: { label: 'Transportation', icon: Car, color: '#0ea5e9' },
  TRAVEL: { label: 'Travel', icon: Plane, color: '#06b6d4' },
  RENT_AND_UTILITIES: { label: 'Rent & Utilities', icon: Home, color: '#10b981' },
  ENTERTAINMENT: { label: 'Entertainment', icon: Film, color: '#ec4899' },
  PERSONAL_CARE: { label: 'Personal Care', icon: Scissors, color: '#f43f5e' },
  MEDICAL: { label: 'Medical', icon: HeartPulse, color: '#ef4444' },
  HOME_IMPROVEMENT: { label: 'Home', icon: Hammer, color: '#84cc16' },
  GENERAL_SERVICES: { label: 'Services', icon: Wrench, color: '#64748b' },
  GOVERNMENT_AND_NON_PROFIT: { label: 'Gov & Donations', icon: Landmark, color: '#a16207' },
  BANK_FEES: { label: 'Bank Fees', icon: ReceiptText, color: '#dc2626' },
  LOAN_PAYMENTS: { label: 'Loan & Card Payments', icon: Banknote, color: '#475569' },
  INCOME: { label: 'Income', icon: Briefcase, color: '#16a34a' },
  TRANSFER_IN: { label: 'Transfer In', icon: ArrowLeftRight, color: '#94a3b8' },
  TRANSFER_OUT: { label: 'Transfer Out', icon: ArrowLeftRight, color: '#94a3b8' },
};

const FALLBACK: CategoryMeta = { label: 'Other', icon: CircleDollarSign, color: '#94a3b8' };

export function categoryOf(t: Txn) {
  return t.user_category ?? t.personal_finance_category?.primary ?? 'OTHER';
}

// Accepts a Plaid category or a transfer group key ("xfer:<type>", see transfers.ts)
export function categoryMeta(key: string): CategoryMeta {
  if (key.startsWith('xfer:')) {
    const meta = TRANSFER_META[key.slice(5) as TransferType];
    if (meta) return meta;
  }
  return CATEGORIES[key] ?? FALLBACK;
}

// Plaid convention: positive amount = money leaving the account.
// Whether money out counts as spending depends on the user's transfer rules (see transfers.ts).
export function isIncome(t: Txn) {
  return t.amount < 0 && categoryOf(t) === 'INCOME';
}

export function displayName(t: Txn) {
  return t.user_name || t.merchant_name || t.name;
}

// Groups transactions from the same merchant, for rules and recurring detection:
// "Netflix", "NETFLIX.COM 866-579" and "Netflix #4412" all become "netflix".
export function merchantKey(t: Pick<Txn, 'merchant_name' | 'name'>) {
  const base = (t.merchant_name || t.name).toLowerCase();
  const words = base
    .replace(/\.(com|net|org|co)\b/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !['inc', 'llc', 'the', 'payment', 'pymt', 'autopay', 'pos', 'debit', 'purchase'].includes(w));
  return words.slice(0, 3).join(' ') || base.trim();
}

// Categories a user can pick when editing a transaction
export const EDITABLE_CATEGORIES = Object.keys(CATEGORIES);

// ---------- Accounts ----------

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  depository: 'Cash',
  credit: 'Credit Cards',
  investment: 'Investments',
  loan: 'Loans',
  other: 'Other',
};

export const ACCOUNT_TYPE_ORDER = ['depository', 'investment', 'credit', 'loan', 'other'];

export function isLiability(acc: AccountBase) {
  return acc.type === 'credit' || acc.type === 'loan';
}

// ---------- Investments ----------

export type { HoldingRow };

export const SECURITY_TYPE_LABELS: Record<string, string> = {
  equity: 'Stocks',
  etf: 'ETFs',
  'mutual fund': 'Mutual Funds',
  'fixed income': 'Bonds',
  cash: 'Cash',
  cryptocurrency: 'Crypto',
  derivative: 'Options',
  loan: 'Loans',
  other: 'Other',
};

// ---------- Aggregations ----------

export function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: dayKey(start), end: dayKey(end) };
}

export function inRange(t: Txn, range: { start: string; end: string }) {
  return t.date >= range.start && t.date <= range.end;
}

export function sumSpending(txns: Txn[], rules: TxnRules) {
  return txns.reduce((sum, t) => (rules.isSpending(t) ? sum + t.amount : sum), 0);
}

export function sumIncome(txns: Txn[]) {
  return txns.reduce((sum, t) => (isIncome(t) ? sum - t.amount : sum), 0);
}

export function spendingByCategory(txns: Txn[], rules: TxnRules) {
  const totals = new Map<string, number>();
  for (const t of txns) {
    if (!rules.isSpending(t)) continue;
    const key = rules.groupKey(t);
    totals.set(key, (totals.get(key) ?? 0) + t.amount);
  }
  return [...totals.entries()]
    .map(([key, total]) => ({ key, total, ...categoryMeta(key) }))
    .sort((a, b) => b.total - a.total);
}

// Spending through the same day-of-month last month, for a fair "pace" comparison
export function lastMonthSameDaySpending(txns: Txn[], rules: TxnRules) {
  const today = new Date();
  const last = monthRange(-1);
  const lastMonthEnd = parseDay(last.end);
  const cutoffDay = Math.min(today.getDate(), lastMonthEnd.getDate());
  const cutoff = dayKey(new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), cutoffDay));
  return sumSpending(txns.filter(t => t.date >= last.start && t.date <= cutoff), rules);
}
