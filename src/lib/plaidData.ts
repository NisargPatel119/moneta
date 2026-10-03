import type { AccountBase } from 'plaid';
import { errorMessage, plaidErrorBody } from '@/lib/errors';
import { ensureSchema, sql } from '@/lib/db';
import { plaidClient } from '@/lib/plaid';
import { getSettings, type AppSettings } from '@/lib/settings';
import { getDemoData, isDemo } from '@/lib/demoData';
import { dayKey, type CategoryRule, type NetWorthPoint, type Txn } from '@/lib/finance';
import {
  isStale, readNetWorthHistory, readRules, readTransactions, snapshotBalances, syncItemTransactions,
} from '@/lib/transactionStore';

// How much stored history to send to the app: enough for recurring detection and year views
const HISTORY_MONTHS = 13;

// Plaid errors that just mean "this bank doesn't offer that data", not a real problem
const UNSUPPORTED = new Set(['PRODUCTS_NOT_SUPPORTED', 'PRODUCT_NOT_ENABLED', 'NO_INVESTMENT_ACCOUNTS', 'NO_ACCOUNTS', 'INVALID_PRODUCT']);

export type HoldingRow = {
  account_id: string;
  security_id: string;
  ticker: string | null;
  name: string;
  type: string;
  quantity: number;
  price: number;
  value: number;
  cost_basis: number | null;
  is_cash: boolean;
};

export type Issue = { item_id: string; code: string; message: string };

export type FinancialData = {
  linked: boolean;
  /** Made-up data from demo mode (see demoData.ts) */
  demo?: boolean;
  netWorth: number;
  assets: number;
  liabilities: number;
  accounts: (AccountBase & { institution: string; item_id: string })[];
  transactions: Txn[];
  holdings: HoldingRow[];
  issues: Issue[];
  settings: AppSettings;
  rules: CategoryRule[];
  history: NetWorthPoint[];
  fetchedAt: string;
};

// Small per-instance cache so chat messages don't re-hit Plaid every time
let cache: { at: number; data: FinancialData } | null = null;
const CACHE_MS = 60_000;

export function clearFinancialCache() {
  cache = null;
}

export async function getFinancialData({ bypassCache = false, forceSync = false } = {}): Promise<FinancialData> {
  if (isDemo()) return getDemoData();
  if (!bypassCache && cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  await ensureSchema();
  const [items, settings] = await Promise.all([
    sql`SELECT access_token, item_id, sync_cursor, last_synced_at FROM plaid_items`,
    getSettings(),
  ]);
  if (items.length === 0) {
    return {
      linked: false, netWorth: 0, assets: 0, liabilities: 0, accounts: [], transactions: [], holdings: [],
      issues: [], settings, rules: [], history: [], fetchedAt: new Date().toISOString(),
    };
  }

  // Ask Plaid about every bank in parallel. Balances and holdings are read live (accountsGet
  // returns Plaid's cached balances: fast and cheap); transactions sync into our database
  // only when they're stale, so most loads read straight from Postgres.
  const results = await Promise.all(items.map(async (row) => {
    const item = row as { access_token: string; item_id: string; sync_cursor: string | null; last_synced_at: string | null };
    const issues: Issue[] = [];

    // Each product is fetched independently so a brokerage without transactions
    // (or a bank without investments) still shows what it does have.
    const [accountsRes, holdings] = await Promise.all([
      plaidClient.accountsGet({ access_token: item.access_token }).catch(e => { issues.push(toIssue(item.item_id, e)); return null; }),
      fetchHoldings(item.access_token).catch(e => { noteIssue(issues, item.item_id, e); return []; }),
      (forceSync || isStale(item)) && syncItemTransactions(item).catch(e => noteIssue(issues, item.item_id, e)),
    ]);

    if (accountsRes) await snapshotBalances(item.item_id, accountsRes.data.accounts);

    const institution = accountsRes?.data.item.institution_name ?? 'Bank';
    return {
      accounts: (accountsRes?.data.accounts ?? []).map(a => ({ ...a, institution, item_id: item.item_id })),
      holdings,
      // One banner per bank is enough
      issues: issues.slice(0, 1),
    };
  }));

  const since = new Date();
  since.setMonth(since.getMonth() - HISTORY_MONTHS);
  const rules = await readRules();
  const [transactions, history] = await Promise.all([
    readTransactions(dayKey(since), rules),
    readNetWorthHistory(),
  ]);

  const accounts = results.flatMap(r => r.accounts);
  const holdings = results.flatMap(r => r.holdings).sort((a, b) => b.value - a.value);
  const issues = results.flatMap(r => r.issues);

  let assets = 0;
  let liabilities = 0;
  for (const acc of accounts) {
    const balance = acc.balances.current || 0;
    if (acc.type === 'credit' || acc.type === 'loan') liabilities += balance;
    else assets += balance;
  }

  const data: FinancialData = {
    linked: true,
    netWorth: assets - liabilities,
    assets,
    liabilities,
    accounts,
    transactions,
    holdings,
    issues,
    settings,
    rules,
    history,
    fetchedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), data };
  return data;
}

function toIssue(itemId: string, e: unknown): Issue {
  const err = plaidErrorBody(e);
  console.error('Plaid error:', err || errorMessage(e));
  return {
    item_id: itemId,
    code: err?.error_code ?? 'UNKNOWN',
    message: err?.display_message || err?.error_message || 'Could not reach this bank.',
  };
}

function noteIssue(issues: Issue[], itemId: string, e: unknown) {
  const code = plaidErrorBody(e)?.error_code;
  if (code && UNSUPPORTED.has(code)) return;
  issues.push(toIssue(itemId, e));
}

async function fetchHoldings(accessToken: string): Promise<HoldingRow[]> {
  const res = await plaidClient.investmentsHoldingsGet({ access_token: accessToken });
  const securities = new Map(res.data.securities.map(s => [s.security_id, s]));
  return res.data.holdings.map(h => {
    const s = securities.get(h.security_id);
    return {
      account_id: h.account_id,
      security_id: h.security_id,
      ticker: s?.ticker_symbol ?? null,
      name: s?.name ?? 'Unknown security',
      type: s?.is_cash_equivalent ? 'cash' : (s?.type ?? 'other'),
      quantity: h.quantity,
      price: h.institution_price,
      value: h.institution_value,
      cost_basis: h.cost_basis,
      is_cash: !!s?.is_cash_equivalent,
    };
  });
}
