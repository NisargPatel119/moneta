import type { Txn } from './finance';
import {
  ArrowLeftRight, Banknote, CalendarClock, CreditCard, Home, Landmark, LineChart, PiggyBank, Repeat, Send,
  type LucideIcon,
} from 'lucide-react';

// ---------- Transfer types the user can configure ----------

export const TRANSFER_TYPES = [
  'internal', 'credit_card', 'savings', 'investments', 'account_transfer', 'bnpl', 'loans', 'mortgage', 'cash', 'other',
] as const;

export type TransferType = (typeof TRANSFER_TYPES)[number];

export type TransferRule = {
  /** Hide from transaction lists (still visible with "Show hidden") */
  hide: boolean;
  /** Count money going out as spending */
  countAsSpending: boolean;
};

export type TransferRules = Record<TransferType, TransferRule>;

export const TRANSFER_META: Record<TransferType, { label: string; description: string; icon: LucideIcon; color: string }> = {
  internal: { label: 'Between my accounts', description: 'Matched automatically: the same amount left one linked account and arrived in another (or back in the same one)', icon: Repeat, color: '#64748b' },
  credit_card: { label: 'Credit card payments', description: 'Paying off a card from checking', icon: CreditCard, color: '#475569' },
  savings: { label: 'Savings transfers', description: 'Moving money to or from savings', icon: PiggyBank, color: '#0891b2' },
  investments: { label: 'Investing & retirement', description: 'Contributions to brokerage, IRA, 401(k), HSA…', icon: LineChart, color: '#1baf7a' },
  account_transfer: { label: 'Account transfers & P2P', description: 'Venmo, Zelle, PayPal, Cash App and other transfers', icon: Send, color: '#8b5cf6' },
  bnpl: { label: 'Buy now, pay later', description: 'Installments to Affirm, Klarna, PayPal Pay in 4…', icon: CalendarClock, color: '#ec4899' },
  loans: { label: 'Loan payments', description: 'Car, student, personal and other loans', icon: Banknote, color: '#a16207' },
  mortgage: { label: 'Mortgage', description: 'Mortgage payments', icon: Home, color: '#10b981' },
  cash: { label: 'Cash & ATM', description: 'ATM withdrawals and cash deposits', icon: Landmark, color: '#0ea5e9' },
  other: { label: 'Other transfers', description: 'Transfers Plaid could not classify further', icon: ArrowLeftRight, color: '#94a3b8' },
};

// Matches today's behavior: transfers aren't spending; only matched internal transfers are hidden
export const DEFAULT_TRANSFER_RULES: TransferRules = Object.fromEntries(
  TRANSFER_TYPES.map(t => [t, { hide: t === 'internal', countAsSpending: false }])
) as TransferRules;

// Fill in defaults and drop anything unexpected (used for data from the database or the client)
export function sanitizeTransferRules(input: unknown): TransferRules {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, Partial<TransferRule>>;
  return Object.fromEntries(TRANSFER_TYPES.map(type => {
    const r = raw[type] ?? {};
    const d = DEFAULT_TRANSFER_RULES[type];
    return [type, {
      hide: typeof r.hide === 'boolean' ? r.hide : d.hide,
      // Internal transfers are your own money moving around, never spending
      countAsSpending: type === 'internal' ? false : typeof r.countAsSpending === 'boolean' ? r.countAsSpending : d.countAsSpending,
    }];
  })) as TransferRules;
}

// ---------- Classification ----------

const TRANSFER_PRIMARIES = new Set(['TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS']);

// Plaid's detailed personal finance category → our transfer type
function typeFromCategory(t: Txn): TransferType | null {
  // A category the user picked wins over Plaid's; Plaid's detail only applies to Plaid's category
  const plaidPrimary = t.personal_finance_category?.primary;
  const primary = t.user_category ?? plaidPrimary;
  if (!primary || !TRANSFER_PRIMARIES.has(primary)) return null;
  const detailed = primary === plaidPrimary ? (t.personal_finance_category?.detailed ?? '') : '';
  if (detailed.endsWith('CREDIT_CARD_PAYMENT')) return 'credit_card';
  if (detailed.endsWith('MORTGAGE_PAYMENT')) return 'mortgage';
  if (detailed.endsWith('_BNPL')) return 'bnpl';
  if (primary === 'LOAN_PAYMENTS') return 'loans';
  if (detailed.endsWith('_SAVINGS')) return 'savings';
  if (detailed.endsWith('INVESTMENT_AND_RETIREMENT_FUNDS')) return 'investments';
  if (detailed.endsWith('ACCOUNT_TRANSFER') || detailed.endsWith('_FROM_APPS')) return 'account_transfer';
  if (detailed === 'TRANSFER_OUT_WITHDRAWAL' || detailed === 'TRANSFER_IN_DEPOSIT') return 'cash';
  return 'other';
}

const MATCH_WINDOW_DAYS = 4;
const DAY_MS = 86_400_000;

// Pairs an outflow with an equal inflow a few days apart: between two linked accounts, or a
// round trip within one account. Both sides must be transfer-like, so a $20 lunch never pairs
// with a $20 deposit.
export function detectInternalTransfers(transactions: Txn[]) {
  const candidates = transactions.filter(t => typeFromCategory(t) !== null);
  const outs = candidates.filter(t => t.amount > 0).sort((a, b) => a.date.localeCompare(b.date));
  const ins = candidates.filter(t => t.amount < 0);
  const matched = new Set<string>();

  for (const out of outs) {
    const outDay = Date.parse(out.date);
    let best: Txn | null = null;
    let bestGap = Infinity;
    for (const inflow of ins) {
      if (matched.has(inflow.transaction_id)) continue;
      if (Math.abs(inflow.amount + out.amount) > 0.005) continue;
      const gap = Math.abs(Date.parse(inflow.date) - outDay) / DAY_MS;
      if (gap <= MATCH_WINDOW_DAYS && gap < bestGap) {
        best = inflow;
        bestGap = gap;
      }
    }
    if (best) {
      matched.add(out.transaction_id);
      matched.add(best.transaction_id);
    }
  }
  return matched;
}

export type TxnRules = {
  /** Transfer type, or null for a regular purchase/income */
  kind: (t: Txn) => TransferType | null;
  /** Money out that should count toward spending totals */
  isSpending: (t: Txn) => boolean;
  /** Hidden from transaction lists by the user's settings */
  isHidden: (t: Txn) => boolean;
  /** Key used to group spending: a Plaid category, or "xfer:<type>" for transfers */
  groupKey: (t: Txn) => string;
  rules: TransferRules;
};

export function makeTxnRules(transactions: Txn[], rules: TransferRules): TxnRules {
  const internal = detectInternalTransfers(transactions);
  const kind = (t: Txn): TransferType | null =>
    internal.has(t.transaction_id) ? 'internal' : typeFromCategory(t);

  return {
    rules,
    kind,
    isSpending: t => {
      if (t.amount <= 0) return false;
      const k = kind(t);
      if (k) return rules[k].countAsSpending;
      return (t.user_category ?? t.personal_finance_category?.primary) !== 'INCOME';
    },
    isHidden: t => {
      const k = kind(t);
      return k ? rules[k].hide : false;
    },
    groupKey: t => {
      const k = kind(t);
      return k ? `xfer:${k}` : (t.user_category ?? t.personal_finance_category?.primary ?? 'OTHER');
    },
  };
}
