// Run with `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { InvestmentTxn } from './finance.ts';
import {
  classifyInvestmentTxn, dividendsByHolding, dividendsByMonth, filterInvestmentTxns, netContributions, splitChange,
} from './investmentActivity.ts';

const today = new Date(2026, 5, 15); // June 15, 2026
let n = 0;
const txn = (changes: Partial<InvestmentTxn>): InvestmentTxn => ({
  id: `t${n++}`, account_id: 'a', security_id: 's1', ticker: 'VTI', name: 'Total Market', security_type: 'etf',
  date: '2026-06-01', kind: 'buy', amount: 100, quantity: 1, price: 100, ...changes,
});

test('classifies Plaid types and subtypes', () => {
  assert.equal(classifyInvestmentTxn('buy', 'buy', 100), 'buy');
  assert.equal(classifyInvestmentTxn('sell', 'sell', -100), 'sell');
  assert.equal(classifyInvestmentTxn('cash', 'dividend', -5), 'dividend');
  assert.equal(classifyInvestmentTxn('cash', 'long term capital gain', -5), 'dividend');
  assert.equal(classifyInvestmentTxn('cash', 'contribution', -500), 'contribution');
  assert.equal(classifyInvestmentTxn('cash', 'deposit', -500), 'contribution');
  assert.equal(classifyInvestmentTxn('cash', 'withdrawal', 200), 'withdrawal');
  assert.equal(classifyInvestmentTxn('transfer', 'transfer', 200), 'withdrawal');
  assert.equal(classifyInvestmentTxn('fee', 'management fee', 3), 'fee');
  assert.equal(classifyInvestmentTxn('cancel', null, 0), 'other');
});

test('net contributions count deposits in and withdrawals out, only inside the dates', () => {
  const txns = [
    txn({ kind: 'contribution', amount: -500, date: '2026-05-10', security_id: null }),
    txn({ kind: 'contribution', amount: -500, date: '2026-04-10', security_id: null }),
    txn({ kind: 'withdrawal', amount: 200, date: '2026-05-20', security_id: null }),
    txn({ kind: 'buy', amount: 500, date: '2026-05-11' }), // trades are not deposits
  ];
  assert.equal(netContributions(txns, '2026-04-10', '2026-06-15'), 300); // the day before the range is excluded
  assert.equal(netContributions(txns, '2026-03-01', '2026-06-15'), 800);
  assert.equal(netContributions([], '2026-03-01', '2026-06-15'), 0);
});

test('splits a change into contributions and growth', () => {
  assert.deepEqual(splitChange(10_000, 12_500, 1_000), { change: 2_500, contributions: 1_000, growth: 1_500 });
  assert.equal(splitChange(10_000, 10_500, 1_000).growth, -500);
});

test('dividends by month covers 12 months, oldest first, with empty months', () => {
  const txns = [
    txn({ kind: 'dividend', amount: -40, date: '2026-06-03' }),
    txn({ kind: 'dividend', amount: -10, date: '2026-06-20' }),
    txn({ kind: 'dividend', amount: -25, date: '2025-07-15' }),
    txn({ kind: 'dividend', amount: -99, date: '2025-06-30' }), // 13 months back: out of the window
    txn({ kind: 'buy', amount: 500, date: '2026-06-02' }),
  ];
  const months = dividendsByMonth(txns, today);
  assert.equal(months.length, 12);
  assert.equal(months[0].month, '2025-07');
  assert.equal(months[11].month, '2026-06');
  assert.equal(months[0].total, 25);
  assert.equal(months[11].total, 50);
  assert.equal(months[5].total, 0);
});

test('dividends by holding sums per security, biggest first, within 12 months', () => {
  const txns = [
    txn({ kind: 'dividend', amount: -30, security_id: 'a', ticker: 'AAA', name: 'A Fund', date: '2026-03-01' }),
    txn({ kind: 'dividend', amount: -20, security_id: 'b', ticker: 'BBB', name: 'B Fund', date: '2026-04-01' }),
    txn({ kind: 'dividend', amount: -20, security_id: 'b', ticker: 'BBB', name: 'B Fund', date: '2026-05-01' }),
    txn({ kind: 'dividend', amount: -500, security_id: 'c', ticker: 'CCC', name: 'Old', date: '2025-01-01' }),
  ];
  const rows = dividendsByHolding(txns, today);
  assert.deepEqual(rows.map(r => [r.label, r.total]), [['BBB', 40], ['AAA', 30]]);
});

test('filters by account and asset type; type filters hide cash events', () => {
  const txns = [
    txn({ account_id: 'a', security_type: 'etf' }),
    txn({ account_id: 'a', security_type: 'equity' }),
    txn({ account_id: 'b', security_type: 'etf' }),
    txn({ account_id: 'a', security_type: null, security_id: null, kind: 'contribution', amount: -50 }),
  ];
  assert.equal(filterInvestmentTxns(txns, new Set(['a']), null).length, 3);
  assert.equal(filterInvestmentTxns(txns, new Set(['a']), t => t === 'etf').length, 1);
  assert.equal(filterInvestmentTxns(txns, new Set(['a', 'b']), t => t === 'etf').length, 2);
});
