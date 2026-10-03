import type { AccountBase, Transaction } from 'plaid';
import { sql } from '@/lib/db';
import { plaidClient } from '@/lib/plaid';

// How far back to pull transactions. 90 days lets the UI compare this month to last month.
const HISTORY_DAYS = 90;

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
  netWorth: number;
  assets: number;
  liabilities: number;
  accounts: (AccountBase & { institution: string })[];
  transactions: Transaction[];
  holdings: HoldingRow[];
  issues: Issue[];
  fetchedAt: string;
};

// Small per-instance cache so chat messages don't re-hit Plaid every time
let cache: { at: number; data: FinancialData } | null = null;
const CACHE_MS = 60_000;

export async function getFinancialData({ fresh = false } = {}): Promise<FinancialData> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  const items = await sql`SELECT access_token, item_id FROM plaid_items`;
  if (items.length === 0) {
    return { linked: false, netWorth: 0, assets: 0, liabilities: 0, accounts: [], transactions: [], holdings: [], issues: [], fetchedAt: new Date().toISOString() };
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - HISTORY_DAYS);
  const endStr = endDate.toISOString().split('T')[0];
  const startStr = startDate.toISOString().split('T')[0];

  // Ask Plaid for every bank in parallel. accountsGet returns Plaid's cached balances,
  // which is much faster (and cheaper) than forcing a live refresh with accountsBalanceGet.
  const results = await Promise.all(items.map(async (item) => {
    const accessToken = item.access_token as string;
    const itemId = item.item_id as string;
    const issues: Issue[] = [];

    // Each product is fetched independently so a brokerage without transactions
    // (or a bank without investments) still shows what it does have.
    const [accountsRes, txns, holdings] = await Promise.all([
      plaidClient.accountsGet({ access_token: accessToken }).catch(e => { issues.push(toIssue(itemId, e)); return null; }),
      fetchAllTransactions(accessToken, startStr, endStr).catch(e => { noteIssue(issues, itemId, e); return []; }),
      fetchHoldings(accessToken).catch(e => { noteIssue(issues, itemId, e); return []; }),
    ]);

    const institution = accountsRes?.data.item.institution_name ?? 'Bank';
    return {
      accounts: (accountsRes?.data.accounts ?? []).map(a => ({ ...a, institution })),
      transactions: txns,
      holdings,
      // One banner per bank is enough
      issues: issues.slice(0, 1),
    };
  }));

  const accounts = results.flatMap(r => r.accounts);
  const transactions = results.flatMap(r => r.transactions);
  const holdings = results.flatMap(r => r.holdings).sort((a, b) => b.value - a.value);
  const issues = results.flatMap(r => r.issues);

  let assets = 0;
  let liabilities = 0;
  for (const acc of accounts) {
    const balance = acc.balances.current || 0;
    if (acc.type === 'credit' || acc.type === 'loan') liabilities += balance;
    else assets += balance;
  }

  // Most recent first
  transactions.sort((a, b) => b.date.localeCompare(a.date));

  const data: FinancialData = {
    linked: true,
    netWorth: assets - liabilities,
    assets,
    liabilities,
    accounts,
    transactions,
    holdings,
    issues,
    fetchedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), data };
  return data;
}

function toIssue(itemId: string, e: any): Issue {
  const err = e.response?.data;
  console.error('Plaid error:', err || e.message);
  return {
    item_id: itemId,
    code: err?.error_code ?? 'UNKNOWN',
    message: err?.display_message || err?.error_message || 'Could not reach this bank.',
  };
}

function noteIssue(issues: Issue[], itemId: string, e: any) {
  const code = e.response?.data?.error_code;
  if (UNSUPPORTED.has(code)) return;
  issues.push(toIssue(itemId, e));
}

// transactionsGet is paginated (max 500 per call), so keep asking until we have them all
async function fetchAllTransactions(accessToken: string, start: string, end: string) {
  const first = await plaidClient.transactionsGet({
    access_token: accessToken,
    start_date: start,
    end_date: end,
    options: { count: 500, offset: 0 },
  });
  const all = [...first.data.transactions];
  const total = first.data.total_transactions;
  while (all.length < total) {
    const next = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: start,
      end_date: end,
      options: { count: 500, offset: all.length },
    });
    if (next.data.transactions.length === 0) break;
    all.push(...next.data.transactions);
  }
  return all;
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
