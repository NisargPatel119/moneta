// Run with `npm test` (Node's built-in test runner; Node 22.6+ runs TypeScript directly)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PLAN, inTodaysDollars, projectNetWorth, sanitizePlan, type ForecastPlan, type StartingPoint } from './forecast.ts';

const today = new Date(2026, 0, 15);
const plan = (changes: Partial<ForecastPlan> = {}): ForecastPlan => ({ ...DEFAULT_PLAN, birthYear: 1986, ...changes });
const start = (changes: Partial<StartingPoint> = {}): StartingPoint => ({
  cash: 0, investments: 0, property: [], debts: 0, debtTrend: 0, ...changes,
});
const near = (actual: number, expected: number, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test('starts at today and runs to the plan-to age', () => {
  const r = projectNetWorth(plan(), start({ cash: 1000 }), { income: 0, spending: 0 }, today);
  assert.equal(r.currentAge, 40);
  assert.equal(r.points[0].age, 40);
  assert.equal(r.points[0].year, 2026);
  assert.equal(r.atEnd.age, 90);
  assert.equal(r.points.length, 51);
});

test('investments compound at the investment growth rate', () => {
  const r = projectNetWorth(plan({ planToAge: 70, retireAge: 65 }), start({ investments: 100_000 }), { income: 0, spending: 0 }, today);
  near(r.points[10].investments, 100_000 * 1.07 ** 10);
});

test('a surplus is saved in the same cash/investment mix as today', () => {
  const r = projectNetWorth(
    plan({ growth: { ...DEFAULT_PLAN.growth, cash: 0, investments: 0 }, incomeGrowth: 0, inflation: 0 }),
    start({ cash: 25_000, investments: 75_000 }),
    { income: 100_000, spending: 60_000 },
    today,
  );
  near(r.points[1].cash, 25_000 + 10_000);
  near(r.points[1].investments, 75_000 + 30_000);
});

test('only the saved share of a surplus is kept', () => {
  const r = projectNetWorth(
    plan({ savedShare: 50, growth: { ...DEFAULT_PLAN.growth, investments: 0 }, incomeGrowth: 0, inflation: 0 }),
    start({ investments: 1 }),
    { income: 50_000, spending: 30_000 },
    today,
  );
  near(r.points[1].investments, 1 + 10_000);
});

test('after retirement, spending comes from cash first, then investments', () => {
  const r = projectNetWorth(
    plan({ birthYear: 1961, retireAge: 65, growth: { ...DEFAULT_PLAN.growth, cash: 0, investments: 0 }, inflation: 0 }),
    start({ cash: 30_000, investments: 100_000 }),
    { income: 80_000, spending: 40_000 },
    today,
  );
  // 65 today: next year is retired, so no income
  near(r.points[1].cash, 0);
  near(r.points[1].investments, 90_000);
  assert.equal(r.points[1].income, 0);
});

test('reports when cash and investments run out', () => {
  const r = projectNetWorth(
    plan({ birthYear: 1961, growth: { ...DEFAULT_PLAN.growth, cash: 0, investments: 0 }, inflation: 0 }),
    start({ investments: 100_000 }),
    { income: 0, spending: 40_000 },
    today,
  );
  // 100k covers 2.5 years of 40k: short in the 3rd year
  assert.equal(r.runsOutAt, 68);
  near(r.points[3].investments, 0);
});

test('money that lasts reports no run-out age', () => {
  const r = projectNetWorth(plan(), start({ investments: 5_000_000 }), { income: 0, spending: 50_000 }, today);
  assert.equal(r.runsOutAt, null);
});

test('spending grows with inflation', () => {
  const r = projectNetWorth(plan({ inflation: 10 }), start({ cash: 1e9 }), { income: 0, spending: 1000 }, today);
  near(r.points[1].spending, 1000);
  near(r.points[2].spending, 1100);
});

test('property grows at its own rate and debts follow the trend down to zero', () => {
  const r = projectNetWorth(plan(), start({ property: [{ value: 20_000, rate: -15 }], debts: 10_000, debtTrend: -4_000 }), { income: 0, spending: 0 }, today);
  near(r.points[1].property, 17_000);
  assert.equal(r.points[1].debts, 6_000);
  assert.equal(r.points[3].debts, 0);
});

test("today's dollars remove inflation", () => {
  near(inTodaysDollars(1.03 ** 10 * 1000, 10, 3), 1000);
});

test('sanitizePlan fills defaults and clamps bad input', () => {
  const p = sanitizePlan({ retireAge: 200, planToAge: 50, savedShare: -5, income: '', spending: '42000', growth: { investments: 'abc' } });
  assert.equal(p.retireAge, 85);
  assert.equal(p.planToAge, 86);
  assert.equal(p.savedShare, 0);
  assert.equal(p.income, null);
  assert.equal(p.spending, 42000);
  assert.equal(p.growth.investments, DEFAULT_PLAN.growth.investments);
  assert.equal(sanitizePlan(null).birthYear, null);
});
