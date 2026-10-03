import type { AccountBase, Transaction } from 'plaid';
import { sql } from '@/lib/db';
import { plaidClient } from '@/lib/plaid';
import { plaidErrorBody } from '@/lib/errors';
import { dayKey, merchantKey, type CategoryRule, type NetWorthPoint, type Txn } from '@/lib/finance';

// How long synced data counts as fresh before the dashboard asks Plaid again
const SYNC_STALE_MS = 10 * 60_000;
// Ask for up to 2 years when an Item's history is first pulled (Plaid ignores this for older Items)
const DAYS_REQUESTED = 730;
// Rows per INSERT; Postgres arrays keep this to one round trip per chunk
const CHUNK = 500;

type ItemRow = { access_token: string; item_id: string; sync_cursor: string | null; last_synced_at: string | null };

export function isStale(item: ItemRow) {
  return !item.last_synced_at || Date.now() - new Date(item.last_synced_at).getTime() > SYNC_STALE_MS;
}

// Pulls everything that changed since the saved cursor and applies it to the transactions table.
// https://plaid.com/docs/api/products/transactions/#transactionssync
export async function syncItemTransactions(item: ItemRow) {
  let cursor = item.sync_cursor ?? undefined;
  const added: Transaction[] = [];
  const modified: Transaction[] = [];
  const removed: string[] = [];

  for (let restarts = 0; ; ) {
    try {
      let hasMore = true;
      while (hasMore) {
        const res = await plaidClient.transactionsSync({
          access_token: item.access_token,
          cursor,
          count: 500,
          options: { include_personal_finance_category: true, days_requested: DAYS_REQUESTED },
        });
        added.push(...res.data.added);
        modified.push(...res.data.modified);
        removed.push(...res.data.removed.map(r => r.transaction_id));
        cursor = res.data.next_cursor;
        hasMore = res.data.has_more;
      }
      break;
    } catch (e) {
      // Data changed mid-pagination: Plaid says to restart from the original cursor
      if (plaidErrorBody(e)?.error_code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' && restarts++ < 3) {
        cursor = item.sync_cursor ?? undefined;
        added.length = modified.length = removed.length = 0;
        continue;
      }
      throw e;
    }
  }

  await upsertTransactions(item.item_id, [...added, ...modified]);
  // A pending transaction that posts arrives as a new id: carry the user's edits across
  await carryOverEdits([...added, ...modified]);
  if (removed.length > 0) {
    await sql`DELETE FROM transactions WHERE transaction_id = ANY(${removed}::text[])`;
  }
  await sql`
    UPDATE plaid_items SET sync_cursor = ${cursor ?? null}, last_synced_at = NOW()
    WHERE item_id = ${item.item_id}
  `;
}

async function upsertTransactions(itemId: string, txns: Transaction[]) {
  for (let i = 0; i < txns.length; i += CHUNK) {
    const rows = txns.slice(i, i + CHUNK);
    await sql`
      INSERT INTO transactions (
        transaction_id, item_id, account_id, date, amount, name, merchant_name, pending,
        pending_transaction_id, logo_url, pfc_primary, pfc_detailed
      )
      SELECT * FROM UNNEST(
        ${rows.map(t => t.transaction_id)}::text[],
        ${rows.map(() => itemId)}::text[],
        ${rows.map(t => t.account_id)}::text[],
        ${rows.map(t => t.date)}::text[],
        ${rows.map(t => t.amount)}::float8[],
        ${rows.map(t => t.name ?? t.merchant_name ?? 'Unknown')}::text[],
        ${rows.map(t => t.merchant_name ?? null)}::text[],
        ${rows.map(t => t.pending)}::boolean[],
        ${rows.map(t => t.pending_transaction_id ?? null)}::text[],
        ${rows.map(t => t.logo_url ?? null)}::text[],
        ${rows.map(t => t.personal_finance_category?.primary ?? null)}::text[],
        ${rows.map(t => t.personal_finance_category?.detailed ?? null)}::text[]
      )
      ON CONFLICT (transaction_id) DO UPDATE SET
        account_id = EXCLUDED.account_id,
        date = EXCLUDED.date,
        amount = EXCLUDED.amount,
        name = EXCLUDED.name,
        merchant_name = EXCLUDED.merchant_name,
        pending = EXCLUDED.pending,
        pending_transaction_id = EXCLUDED.pending_transaction_id,
        logo_url = EXCLUDED.logo_url,
        pfc_primary = EXCLUDED.pfc_primary,
        pfc_detailed = EXCLUDED.pfc_detailed,
        updated_at = NOW()
    `;
  }
}

async function carryOverEdits(txns: Transaction[]) {
  const pairs = txns.filter(t => t.pending_transaction_id);
  if (pairs.length === 0) return;
  await sql`
    UPDATE transactions AS posted SET
      user_category = COALESCE(posted.user_category, pend.user_category),
      user_name = COALESCE(posted.user_name, pend.user_name),
      notes = COALESCE(posted.notes, pend.notes)
    FROM transactions AS pend
    WHERE posted.transaction_id = ANY(${pairs.map(t => t.transaction_id)}::text[])
      AND pend.transaction_id = posted.pending_transaction_id
  `;
}

// Records today's balance for each account (re-running the same day just updates it)
export async function snapshotBalances(itemId: string, accounts: AccountBase[]) {
  if (accounts.length === 0) return;
  const today = dayKey(new Date());
  await sql`
    INSERT INTO account_balances (date, account_id, item_id, type, current)
    SELECT * FROM UNNEST(
      ${accounts.map(() => today)}::text[],
      ${accounts.map(a => a.account_id)}::text[],
      ${accounts.map(() => itemId)}::text[],
      ${accounts.map(a => a.type ?? null)}::text[],
      ${accounts.map(a => a.balances.current ?? 0)}::float8[]
    )
    ON CONFLICT (date, account_id) DO UPDATE SET current = EXCLUDED.current, type = EXCLUDED.type
  `;
}

type TxnRow = {
  transaction_id: string; account_id: string; date: string; amount: number; name: string;
  merchant_name: string | null; pending: boolean; logo_url: string | null;
  pfc_primary: string | null; pfc_detailed: string | null;
  user_category: string | null; user_name: string | null; notes: string | null;
};

// Reads stored transactions and applies the user's edits: a manual edit beats a merchant rule,
// which beats Plaid's category.
export async function readTransactions(sinceDay: string, rules: CategoryRule[]): Promise<Txn[]> {
  const rows = (await sql`
    SELECT transaction_id, account_id, date, amount, name, merchant_name, pending, logo_url,
           pfc_primary, pfc_detailed, user_category, user_name, notes
    FROM transactions
    WHERE date >= ${sinceDay}
    ORDER BY date DESC, transaction_id
  `) as TxnRow[];

  const byMerchant = new Map(rules.map(r => [r.merchant_key, r]));
  return rows.map(r => {
    const rule = byMerchant.get(merchantKey(r));
    const manual = r.user_category != null || r.user_name != null;
    return {
      transaction_id: r.transaction_id,
      account_id: r.account_id,
      date: r.date,
      amount: r.amount,
      name: r.name,
      merchant_name: r.merchant_name,
      pending: r.pending,
      logo_url: r.logo_url,
      personal_finance_category: r.pfc_primary ? { primary: r.pfc_primary, detailed: r.pfc_detailed ?? '' } : null,
      user_category: r.user_category ?? rule?.category ?? null,
      user_name: r.user_name ?? rule?.rename ?? null,
      notes: r.notes,
      edited: manual ? 'manual' : rule ? 'rule' : null,
    };
  });
}

export async function readRules(): Promise<CategoryRule[]> {
  return (await sql`SELECT id, merchant_key, category, rename FROM category_rules ORDER BY created_at DESC`) as CategoryRule[];
}

// Daily net worth from balance snapshots. An account missing on a day (e.g. its bank was
// unreachable) keeps its last known balance for up to a week instead of dropping to zero.
export async function readNetWorthHistory(): Promise<NetWorthPoint[]> {
  const rows = (await sql`
    SELECT date, account_id, type, current FROM account_balances ORDER BY date
  `) as { date: string; account_id: string; type: string | null; current: number | null }[];

  const last = new Map<string, { date: string; type: string | null; current: number }>();
  const points: NetWorthPoint[] = [];
  const dates = [...new Set(rows.map(r => r.date))];
  let i = 0;
  for (const date of dates) {
    for (; i < rows.length && rows[i].date === date; i++) {
      last.set(rows[i].account_id, { date, type: rows[i].type, current: rows[i].current ?? 0 });
    }
    let assets = 0;
    let liabilities = 0;
    for (const [id, a] of last) {
      if (daysBetween(a.date, date) > 7) { last.delete(id); continue; }
      if (a.type === 'credit' || a.type === 'loan') liabilities += a.current;
      else assets += a.current;
    }
    points.push({ date, assets, liabilities, netWorth: assets - liabilities });
  }
  return points;
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}
