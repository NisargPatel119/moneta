import type { FinancialData, HoldingRow } from './plaidData';
import { DEFAULT_TRANSFER_RULES } from './transfers';
import { dayKey, type NetWorthPoint, type Txn } from './finance';

// Demo mode: realistic, made-up finances so anyone can try Moneta (and take screenshots)
// without connecting a bank. No Plaid, database, or password needed, and real data is never read.
export function isDemo() {
  return process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1';
}

// Small seeded random generator, so the demo looks the same on every load
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type DemoAccount = {
  id: string; item: string; institution: string; name: string; mask: string;
  type: string; subtype: string; current: number; limit?: number;
};

const ACCOUNTS: DemoAccount[] = [
  { id: 'chk', item: 'demo-northwind', institution: 'Northwind Bank', name: 'Everyday Checking', mask: '4821', type: 'depository', subtype: 'checking', current: 6240.18 },
  { id: 'sav', item: 'demo-northwind', institution: 'Northwind Bank', name: 'High-Yield Savings', mask: '9930', type: 'depository', subtype: 'savings', current: 24500 },
  { id: 'auto', item: 'demo-northwind', institution: 'Northwind Bank', name: 'Auto Loan', mask: '2290', type: 'loan', subtype: 'auto', current: 11820.4 },
  { id: 'card', item: 'demo-summit', institution: 'Summit Card', name: 'Rewards Visa', mask: '3107', type: 'credit', subtype: 'credit card', current: 1284.55, limit: 12000 },
  { id: 'brk', item: 'demo-harbor', institution: 'Harbor Investments', name: 'Individual Brokerage', mask: '5512', type: 'investment', subtype: 'brokerage', current: 0 },
  { id: 'k401', item: 'demo-harbor', institution: 'Harbor Investments', name: '401(k)', mask: '7720', type: 'investment', subtype: '401k', current: 0 },
  { id: 'roth', item: 'demo-harbor', institution: 'Harbor Investments', name: 'Roth IRA', mask: '6604', type: 'investment', subtype: 'roth', current: 0 },
];

// [account, ticker, name, type, quantity, price, cost basis or null]
const HOLDINGS: [string, string | null, string, string, number, number, number | null][] = [
  ['brk', 'VTI', 'Vanguard Total Stock Market ETF', 'etf', 210, 301.42, 48000],
  ['brk', 'VXUS', 'Vanguard Total International Stock ETF', 'etf', 300, 66.18, 17400],
  ['brk', 'AAPL', 'Apple Inc.', 'equity', 60, 229.87, 9600],
  ['brk', 'NVDA', 'NVIDIA Corporation', 'equity', 40, 131.6, 2900],
  ['brk', null, 'Cash sweep', 'cash', 2350, 1, null],
  ['k401', null, 'Target Retirement 2060 Fund', 'mutual fund', 1450, 58.21, 68000],
  ['k401', null, 'S&P 500 Index Fund', 'mutual fund', 520, 160.35, null],
  ['roth', 'VOO', 'Vanguard S&P 500 ETF', 'etf', 70, 553.9, 30500],
  ['roth', 'BND', 'Vanguard Total Bond Market ETF', 'etf', 120, 73.12, 9100],
  ['roth', 'MSFT', 'Microsoft Corporation', 'equity', 18, 428.15, 6200],
];

let cached: { day: string; data: FinancialData } | null = null;

export function getDemoData(): FinancialData {
  const today = new Date();
  const todayKey = dayKey(today);
  if (cached?.day === todayKey) return cached.data;

  const holdings: HoldingRow[] = HOLDINGS.map(([account_id, ticker, name, type, quantity, price, cost_basis], i) => ({
    account_id, security_id: `demo-sec-${i}`, ticker, name, type, quantity, price,
    value: Math.round(quantity * price * 100) / 100, cost_basis, is_cash: type === 'cash',
  }));
  // Investment balances are the sum of their holdings
  for (const a of ACCOUNTS) {
    if (a.type === 'investment') a.current = holdings.filter(h => h.account_id === a.id).reduce((s, h) => s + h.value, 0);
  }

  const accounts = ACCOUNTS.map(a => ({
    account_id: a.id,
    item_id: a.item,
    institution: a.institution,
    name: a.name,
    official_name: null,
    mask: a.mask,
    type: a.type,
    subtype: a.subtype,
    balances: {
      current: Math.round(a.current * 100) / 100,
      available: a.type === 'depository' ? Math.round(a.current * 100) / 100 : null,
      limit: a.limit ?? null,
      iso_currency_code: 'USD',
      unofficial_currency_code: null,
    },
  })) as unknown as FinancialData['accounts'];

  const transactions = buildTransactions(today);

  let assets = 0;
  let liabilities = 0;
  for (const a of accounts) {
    const bal = a.balances.current ?? 0;
    if (a.type === 'credit' || a.type === 'loan') liabilities += bal;
    else assets += bal;
  }

  const data: FinancialData = {
    linked: true,
    demo: true,
    netWorth: assets - liabilities,
    assets,
    liabilities,
    accounts,
    transactions,
    holdings: holdings.sort((a, b) => b.value - a.value),
    issues: [],
    settings: { transferRules: DEFAULT_TRANSFER_RULES, dismissedRecurring: [] },
    rules: [],
    history: buildHistory(today, assets, liabilities),
    fetchedAt: today.toISOString(),
  };
  cached = { day: todayKey, data };
  return data;
}

function buildTransactions(today: Date): Txn[] {
  const rand = rng(20261003);
  const between = (min: number, max: number) => Math.round((min + rand() * (max - min)) * 100) / 100;
  const txns: Txn[] = [];
  let n = 0;
  const todayKey = dayKey(today);

  const add = (date: Date, name: string, amount: number, primary: string, detailed: string, account: string, merchant: string | null = name) => {
    const key = dayKey(date);
    if (key > todayKey) return;
    // The last couple of days are still pending, like real bank data
    const pending = (today.getTime() - date.getTime()) / 86_400_000 < 2 && primary !== 'INCOME';
    txns.push({
      transaction_id: `demo-${++n}`, account_id: account, date: key, amount, name, merchant_name: merchant,
      pending, logo_url: null, personal_finance_category: { primary, detailed },
      user_category: null, user_name: null, notes: null, edited: null,
    });
  };

  const start = new Date(today.getFullYear(), today.getMonth() - 13, 1);
  const cardSpendByMonth = new Map<string, number>();
  const onCard = (date: Date, name: string, amount: number, primary: string, detailed: string) => {
    add(date, name, amount, primary, detailed, 'card');
    const month = dayKey(date).slice(0, 7);
    cardSpendByMonth.set(month, (cardSpendByMonth.get(month) ?? 0) + amount);
  };

  // Day by day: everyday spending with a little randomness
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const date = new Date(d);
    const dow = date.getDay();
    if (dow === 6 || (dow === 3 && rand() < 0.5)) onCard(date, rand() < 0.5 ? 'Whole Foods Market' : "Trader Joe's", between(48, 165), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES');
    if (dow >= 1 && dow <= 5 && rand() < 0.45) onCard(date, 'Blue Bottle Coffee', between(4.5, 8.5), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE');
    if (rand() < 0.28) {
      const spots = ['Sweetgreen', 'Chipotle', 'Little Thai Kitchen', 'Tartine Bakery', 'Shake Shack'];
      onCard(date, spots[Math.floor(rand() * spots.length)], between(14, 68), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANT');
    }
    if (rand() < 0.22) onCard(date, 'Uber', between(11, 38), 'TRANSPORTATION', 'TRANSPORTATION_TAXIS_AND_RIDE_SHARES');
    if (rand() < 0.1) onCard(date, 'Shell', between(38, 62), 'TRANSPORTATION', 'TRANSPORTATION_GAS');
    if (rand() < 0.1) onCard(date, 'Amazon', between(14, 120), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES');
    if (rand() < 0.05) onCard(date, 'Target', between(22, 95), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_SUPERSTORES');
    if (rand() < 0.03) onCard(date, 'CVS Pharmacy', between(8, 42), 'MEDICAL', 'MEDICAL_PHARMACIES_AND_SUPPLEMENTS');
    if (rand() < 0.025) onCard(date, 'AMC Theatres', between(18, 44), 'ENTERTAINMENT', 'ENTERTAINMENT_TV_AND_MOVIES');
    if (rand() < 0.03) add(date, 'Venmo', between(18, 85), 'TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER', 'chk');
    // Paycheck every other Friday
    if (dow === 5 && Math.floor((date.getTime() - start.getTime()) / (7 * 86_400_000)) % 2 === 0) {
      add(date, 'Acme Corp Payroll', -3850, 'INCOME', 'INCOME_WAGES', 'chk');
    }
  }

  // Monthly bills, subscriptions and transfers
  for (let m = new Date(start); m <= today; m.setMonth(m.getMonth() + 1)) {
    const y = m.getFullYear();
    const mo = m.getMonth();
    const on = (day: number) => new Date(y, mo, day);
    const monthsAgo = (today.getFullYear() - y) * 12 + (today.getMonth() - mo);

    add(on(1), 'Maple Court Apartments', 2400, 'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT', 'chk');
    add(on(12), 'City Power & Light', between(68, 142), 'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY', 'chk');
    add(on(9), 'FiberNet Internet', 70, 'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_INTERNET_AND_CABLE', 'chk');
    onCard(on(18), 'Verizon', 85, 'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_TELEPHONE');
    // Netflix raised its price two months ago (shows a price-increase alert)
    onCard(on(7), 'Netflix', monthsAgo <= 1 ? 17.99 : 15.49, 'ENTERTAINMENT', 'ENTERTAINMENT_TV_AND_MOVIES');
    onCard(on(14), 'Spotify', 11.99, 'ENTERTAINMENT', 'ENTERTAINMENT_MUSIC_AND_AUDIO');
    onCard(on(3), 'Iron Peak Gym', 45, 'PERSONAL_CARE', 'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS');
    onCard(on(21), 'iCloud+', 2.99, 'GENERAL_SERVICES', 'GENERAL_SERVICES_OTHER_GENERAL_SERVICES');
    add(on(15), 'Northwind Auto Loan', 385, 'LOAN_PAYMENTS', 'LOAN_PAYMENTS_CAR_PAYMENT', 'chk');
    add(on(28), 'Interest Payment', -between(88, 104), 'INCOME', 'INCOME_INTEREST_EARNED', 'sav');
    // Moving your own money around: matched automatically as internal transfers
    add(on(2), 'Transfer to Savings', 500, 'TRANSFER_OUT', 'TRANSFER_OUT_SAVINGS', 'chk');
    add(on(2), 'Transfer from Checking', -500, 'TRANSFER_IN', 'TRANSFER_IN_ACCOUNT_TRANSFER', 'sav');
    add(on(20), 'Harbor Investments', 750, 'TRANSFER_OUT', 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS', 'chk');
    // A trip four months ago
    if (monthsAgo === 4) {
      onCard(on(10), 'Delta Air Lines', 428.6, 'TRAVEL', 'TRAVEL_FLIGHTS');
      onCard(on(22), 'Marriott', 612.4, 'TRAVEL', 'TRAVEL_LODGING');
    }
  }

  // Pay the card in full each month (checking → card, matched as an internal transfer)
  for (const [month, total] of cardSpendByMonth) {
    const [y, mo] = month.split('-').map(Number);
    const due = new Date(y, mo, 5); // the 5th of the following month
    const amount = Math.round(total * 100) / 100;
    add(due, 'Summit Card Payment', amount, 'LOAN_PAYMENTS', 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT', 'chk');
    add(due, 'Payment Received', -amount, 'LOAN_PAYMENTS', 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT', 'card');
  }

  return txns.sort((a, b) => b.date.localeCompare(a.date) || a.transaction_id.localeCompare(b.transaction_id));
}

// A year of daily net worth: steady saving plus market ups and downs, ending at today's value
function buildHistory(today: Date, assets: number, liabilities: number): NetWorthPoint[] {
  const rand = rng(7);
  const days = 365;
  const walk: number[] = [0];
  for (let i = 1; i < days; i++) walk.push(walk[i - 1] + (rand() - 0.47) * 1900);
  const points: NetWorthPoint[] = [];
  for (let i = 0; i < days; i++) {
    const daysAgo = days - 1 - i;
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    // Drift so the year shows growth, plus the random walk re-anchored to end at today
    const drift = -daysAgo * 165;
    const noise = walk[i] - walk[days - 1];
    const a = assets + drift + noise;
    const l = liabilities + daysAgo * 9; // the auto loan shrinks over the year
    points.push({ date: dayKey(d), assets: a, liabilities: l, netWorth: a - l });
  }
  return points;
}
