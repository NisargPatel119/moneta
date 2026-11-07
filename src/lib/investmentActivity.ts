// Pure functions (no React), so they run under `npm test`. Types only from finance.ts keeps that import free.
import type { InvestmentTxn, InvestmentTxnKind } from './finance.ts';

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Turns Plaid's investment transaction type/subtype into the few kinds the app shows.
// https://plaid.com/docs/api/products/investments/#investments-transactions-get
export function classifyInvestmentTxn(type: string | null, subtype: string | null, amount: number): InvestmentTxnKind {
  const sub = (subtype ?? '').toLowerCase();
  if (type === 'fee' || sub.includes('fee')) return 'fee';
  if (/dividend|capital gain/.test(sub)) return 'dividend';
  if (sub === 'contribution') return 'contribution';
  if (sub === 'withdrawal' || sub === 'distribution') return 'withdrawal';
  // Plain transfers of cash in or out of the account
  if ((type === 'cash' || type === 'transfer') && (sub === 'deposit' || sub === 'transfer')) return amount < 0 ? 'contribution' : 'withdrawal';
  if (type === 'buy') return 'buy';
  if (type === 'sell') return 'sell';
  return 'other';
}

export const KIND_LABELS: Record<InvestmentTxnKind, string> = {
  buy: 'Bought',
  sell: 'Sold',
  dividend: 'Dividend',
  contribution: 'Contribution',
  withdrawal: 'Withdrawal',
  fee: 'Fee',
  other: 'Other',
};

// The same filters as the rest of the Investments tab: accounts that pass, plus an optional asset-type test.
// Cash events (deposits, fees) have no security, so an asset-type filter hides them.
export function filterInvestmentTxns(
  txns: InvestmentTxn[], accountIds: Set<string>, typeMatches: ((type: string) => boolean) | null,
) {
  return txns.filter(t => accountIds.has(t.account_id) && (!typeMatches || (t.security_type != null && typeMatches(t.security_type))));
}

// Money you added minus money you took out, for days after `afterDay` up to and including `throughDay`
export function netContributions(txns: InvestmentTxn[], afterDay: string, throughDay: string) {
  return txns
    .filter(t => (t.kind === 'contribution' || t.kind === 'withdrawal') && t.date > afterDay && t.date <= throughDay)
    .reduce((s, t) => s + -t.amount, 0);
}

// Splits a change in value into what you put in and what the market did
export function splitChange(startValue: number, endValue: number, contributions: number) {
  const change = endValue - startValue;
  return { change, contributions, growth: change - contributions };
}

function monthStart(today: Date, offset: number) {
  return dayKey(new Date(today.getFullYear(), today.getMonth() + offset, 1));
}

// Dividends received in each of the last `months` months (oldest first, including months with none)
export function dividendsByMonth(txns: InvestmentTxn[], today: Date, months = 12) {
  const out = Array.from({ length: months }, (_, i) => ({ month: monthStart(today, i - (months - 1)).slice(0, 7), total: 0 }));
  for (const t of txns) {
    if (t.kind !== 'dividend') continue;
    const bucket = out.find(m => m.month === t.date.slice(0, 7));
    if (bucket) bucket.total += -t.amount;
  }
  return out;
}

export type HoldingDividend = { key: string; label: string; name: string; total: number };

// Dividends by security over the last `months` months, biggest first
export function dividendsByHolding(txns: InvestmentTxn[], today: Date, months = 12): HoldingDividend[] {
  const since = monthStart(today, -(months - 1));
  const byKey = new Map<string, HoldingDividend>();
  for (const t of txns) {
    if (t.kind !== 'dividend' || t.date < since) continue;
    const key = t.security_id ?? t.name;
    const row = byKey.get(key) ?? { key, label: t.ticker ?? t.name, name: t.name, total: 0 };
    row.total += -t.amount;
    byKey.set(key, row);
  }
  return [...byKey.values()].sort((a, b) => b.total - a.total);
}

// What a row says in the activity list: "Bought 3 × $120.00" style detail, kept plain
export function activityDetail(t: InvestmentTxn) {
  if ((t.kind === 'buy' || t.kind === 'sell') && t.quantity != null && t.price != null) {
    return { quantity: Math.abs(t.quantity), price: t.price };
  }
  return null;
}
