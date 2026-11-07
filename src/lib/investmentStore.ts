import { sql } from '@/lib/db';
import { dayKey, parseDay, type InvestmentHistory, type InvestmentTxn, type SecurityPoint } from '@/lib/finance';
import { classifyInvestmentTxn } from '@/lib/investmentActivity';
import { plaidClient } from '@/lib/plaid';
import type { HoldingRow } from '@/lib/plaidData';

// Records today's value of every holding (re-running the same day just updates it)
export async function snapshotHoldings(holdings: HoldingRow[]) {
  if (holdings.length === 0) return;
  const today = dayKey(new Date());
  await sql`
    INSERT INTO holding_snapshots (date, account_id, security_id, ticker, name, type, quantity, price, value)
    SELECT * FROM UNNEST(
      ${holdings.map(() => today)}::text[],
      ${holdings.map(h => h.account_id)}::text[],
      ${holdings.map(h => h.security_id)}::text[],
      ${holdings.map(h => h.ticker)}::text[],
      ${holdings.map(h => h.name)}::text[],
      ${holdings.map(h => h.type)}::text[],
      ${holdings.map(h => h.quantity)}::float8[],
      ${holdings.map(h => h.price)}::float8[],
      ${holdings.map(h => h.value)}::float8[]
    )
    ON CONFLICT (date, account_id, security_id) DO UPDATE SET
      ticker = EXCLUDED.ticker, name = EXCLUDED.name, type = EXCLUDED.type,
      quantity = EXCLUDED.quantity, price = EXCLUDED.price, value = EXCLUDED.value
  `;
}

const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000);

// Investment value per account and asset type per day, for the Investments chart and its filters.
// Days before holdings were first recorded for an account fall back to that account's balance
// (type null: it counts toward totals but can't be split by asset type). A day with no data keeps
// the last known value for up to a week, like net worth history.
export async function readInvestmentHistory(investmentAccountIds: string[]): Promise<InvestmentHistory> {
  if (investmentAccountIds.length === 0) return { dates: [], series: [], typedSince: null };
  type TypedRow = { date: string; account_id: string; type: string; value: number };
  type BalanceRow = { date: string; account_id: string; current: number | null };
  const [typedRows, balanceRows] = await Promise.all([
    sql`
      SELECT date, account_id, type, SUM(value) AS value FROM holding_snapshots
      WHERE account_id = ANY(${investmentAccountIds}::text[])
      GROUP BY date, account_id, type
    `.then(rows => rows as TypedRow[]),
    sql`
      SELECT date, account_id, current FROM account_balances
      WHERE account_id = ANY(${investmentAccountIds}::text[])
    `.then(rows => rows as BalanceRow[]),
  ]);
  return buildInvestmentHistory(
    typedRows.map(r => ({ ...r, value: Number(r.value) })),
    balanceRows.map(r => ({ date: r.date, account_id: r.account_id, value: r.current ?? 0 })),
  );
}

// Pure part of readInvestmentHistory, shared with demo mode
export function buildInvestmentHistory(
  typed: { date: string; account_id: string; type: string; value: number }[],
  balances: { date: string; account_id: string; value: number }[],
): InvestmentHistory {
  const dates = [...new Set([...typed.map(r => r.date), ...balances.map(r => r.date)])].sort();
  const accounts = [...new Set([...typed.map(r => r.account_id), ...balances.map(r => r.account_id)])];
  const series: InvestmentHistory['series'] = [];
  const seriesFor = (account_id: string, type: string | null) => {
    let s = series.find(x => x.account_id === account_id && x.type === type);
    if (!s) {
      s = { account_id, type, values: new Array(dates.length).fill(0) };
      series.push(s);
    }
    return s;
  };

  for (const account of accounts) {
    const typedByDate = new Map<string, Map<string, number>>();
    for (const r of typed) {
      if (r.account_id !== account) continue;
      const day = typedByDate.get(r.date) ?? new Map<string, number>();
      day.set(r.type, (day.get(r.type) ?? 0) + r.value);
      typedByDate.set(r.date, day);
    }
    const balanceByDate = new Map(balances.filter(r => r.account_id === account).map(r => [r.date, r.value]));
    const firstTyped = [...typedByDate.keys()].sort()[0];

    let last: { date: string; byType: Map<string | null, number> } | null = null;
    dates.forEach((date, i) => {
      const typedDay = typedByDate.get(date);
      if (typedDay) last = { date, byType: typedDay as Map<string | null, number> };
      else if (balanceByDate.has(date) && (!firstTyped || date < firstTyped)) last = { date, byType: new Map([[null, balanceByDate.get(date)!]]) };
      if (!last || daysBetween(last.date, date) > 7) return;
      for (const [type, value] of last.byType) seriesFor(account, type).values[i] = value;
    });
  }

  const typedDates = typed.map(r => r.date).sort();
  return { dates, series, typedSince: typedDates[0] ?? null };
}

// One security's value over time, summed across the given accounts
export async function readSecurityHistory(securityId: string, accountIds: string[]): Promise<SecurityPoint[]> {
  const rows = (await sql`
    SELECT date, SUM(value) AS value, SUM(quantity) AS quantity, MAX(price) AS price
    FROM holding_snapshots
    WHERE security_id = ${securityId} AND account_id = ANY(${accountIds}::text[])
    GROUP BY date ORDER BY date
  `) as { date: string; value: number; quantity: number; price: number }[];
  return rows.map(r => ({ date: r.date, value: Number(r.value), quantity: Number(r.quantity), price: Number(r.price) }));
}

// ---------- Investment activity ----------

// Plaid returns up to 500 per page; rows are also saved in chunks of this size
const ACTIVITY_MONTHS = 24;
const ACTIVITY_PAGE = 500;
const ACTIVITY_STALE_MS = 10 * 60_000;

export function activityIsStale(item: { investments_synced_at: string | null }) {
  return !item.investments_synced_at || Date.now() - new Date(item.investments_synced_at).getTime() > ACTIVITY_STALE_MS;
}

// Pulls 24 months of investment transactions for one bank and saves them (re-runs just update rows).
// Throws Plaid's errors so the caller can treat "this bank has no investments" quietly.
export async function syncInvestmentTransactions(item: { access_token: string; item_id: string }) {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - ACTIVITY_MONTHS);
  const rows: InvestmentTxn[] = [];
  const meta = new Map<string, { type: string | null; subtype: string | null }>();

  for (let offset = 0, total = Infinity; offset < total; ) {
    const res = await plaidClient.investmentsTransactionsGet({
      access_token: item.access_token,
      start_date: dayKey(start),
      end_date: dayKey(end),
      options: { count: ACTIVITY_PAGE, offset },
    });
    const securities = new Map(res.data.securities.map(s => [s.security_id, s]));
    for (const t of res.data.investment_transactions) {
      const s = t.security_id ? securities.get(t.security_id) : undefined;
      const kind = classifyInvestmentTxn(t.type, t.subtype, t.amount);
      meta.set(t.investment_transaction_id, { type: t.type, subtype: t.subtype });
      rows.push({
        id: t.investment_transaction_id,
        account_id: t.account_id,
        security_id: t.security_id ?? null,
        ticker: s?.ticker_symbol ?? null,
        name: s?.name ?? t.name,
        security_type: s ? (s.is_cash_equivalent ? 'cash' : s.type ?? 'other') : null,
        date: t.date,
        kind,
        amount: t.amount,
        quantity: t.quantity ?? null,
        price: t.price ?? null,
      });
    }
    total = res.data.total_investment_transactions;
    offset += res.data.investment_transactions.length;
    if (res.data.investment_transactions.length === 0) break;
  }

  for (let i = 0; i < rows.length; i += ACTIVITY_PAGE) {
    const chunk = rows.slice(i, i + ACTIVITY_PAGE);
    await sql`
      INSERT INTO investment_transactions
        (investment_transaction_id, item_id, account_id, security_id, ticker, name, security_type, date, type, subtype, amount, quantity, price)
      SELECT * FROM UNNEST(
        ${chunk.map(r => r.id)}::text[],
        ${chunk.map(() => item.item_id)}::text[],
        ${chunk.map(r => r.account_id)}::text[],
        ${chunk.map(r => r.security_id)}::text[],
        ${chunk.map(r => r.ticker)}::text[],
        ${chunk.map(r => r.name)}::text[],
        ${chunk.map(r => r.security_type)}::text[],
        ${chunk.map(r => r.date)}::text[],
        ${chunk.map(r => meta.get(r.id)!.type)}::text[],
        ${chunk.map(r => meta.get(r.id)!.subtype)}::text[],
        ${chunk.map(r => r.amount)}::float8[],
        ${chunk.map(r => r.quantity)}::float8[],
        ${chunk.map(r => r.price)}::float8[]
      )
      ON CONFLICT (investment_transaction_id) DO UPDATE SET
        account_id = EXCLUDED.account_id, security_id = EXCLUDED.security_id, ticker = EXCLUDED.ticker, name = EXCLUDED.name,
        security_type = EXCLUDED.security_type, date = EXCLUDED.date, type = EXCLUDED.type, subtype = EXCLUDED.subtype,
        amount = EXCLUDED.amount, quantity = EXCLUDED.quantity, price = EXCLUDED.price
    `;
  }
  await markActivitySynced(item.item_id);
}

export async function markActivitySynced(itemId: string) {
  await sql`UPDATE plaid_items SET investments_synced_at = NOW() WHERE item_id = ${itemId}`;
}

export async function readInvestmentTransactions(): Promise<InvestmentTxn[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - ACTIVITY_MONTHS);
  const rows = (await sql`
    SELECT investment_transaction_id, account_id, security_id, ticker, name, security_type, date, type, subtype, amount, quantity, price
    FROM investment_transactions WHERE date >= ${dayKey(since)} ORDER BY date DESC, investment_transaction_id
  `) as {
    investment_transaction_id: string; account_id: string; security_id: string | null; ticker: string | null; name: string;
    security_type: string | null; date: string; type: string | null; subtype: string | null; amount: number;
    quantity: number | null; price: number | null;
  }[];
  return rows.map(r => ({
    id: r.investment_transaction_id,
    account_id: r.account_id,
    security_id: r.security_id,
    ticker: r.ticker,
    name: r.name,
    security_type: r.security_type,
    date: r.date,
    kind: classifyInvestmentTxn(r.type, r.subtype, Number(r.amount)),
    amount: Number(r.amount),
    quantity: r.quantity == null ? null : Number(r.quantity),
    price: r.price == null ? null : Number(r.price),
  }));
}
