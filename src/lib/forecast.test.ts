// Run with `npm test` (Node's built-in test runner; Node 22.6+ runs TypeScript directly)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PLAN, inTodaysDollars, mortgagePayment, newEvent, projectNetWorth, sanitizePlan, type EventType, type ForecastPlan, type LifeEvent, type StartingPoint } from './forecast.ts';

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

// Life events. These use flat growth and no inflation so the arithmetic is easy to follow.
const flat = { cash: 0, investments: 0, realEstate: 0, vehicles: 0, other: 0 };
const ev = (type: EventType, changes: Partial<LifeEvent> = {}): LifeEvent => ({ ...newEvent(type, 40, 65), id: type, ...changes });
const withEvents = (events: LifeEvent[], changes: Partial<ForecastPlan> = {}) => plan({ growth: flat, inflation: 0, incomeGrowth: 0, events, ...changes });
const none = { income: 0, spending: 0 };

test('a retire event moves the retirement age and the marker', () => {
  const r = projectNetWorth(withEvents([ev('retire', { age: 50 })]), start({ cash: 1000 }), { income: 100_000, spending: 50_000 }, today);
  assert.equal(r.retireAge, 50);
  assert.equal(r.atRetirement?.age, 50);
  assert.equal(r.points[10].income, 100_000); // age 50: last working year
  assert.equal(r.points[11].income, 0);
  assert.deepEqual(r.points[10].events, ['Retire']);
});

test('a disabled event does nothing', () => {
  const base = projectNetWorth(withEvents([]), start({ cash: 1000 }), none, today);
  const r = projectNetWorth(withEvents([ev('windfall', { age: 45, amount: 90_000, enabled: false })]), start({ cash: 1000 }), none, today);
  assert.equal(r.atEnd.netWorth, base.atEnd.netWorth);
  const r2 = projectNetWorth(withEvents([ev('retire', { age: 50, enabled: false })]), start(), none, today);
  assert.equal(r2.retireAge, 65);
});

test('a windfall is added once, in full, whatever the saved share', () => {
  const r = projectNetWorth(withEvents([ev('windfall', { age: 45, amount: 80_000 })], { savedShare: 10 }), start({ investments: 1000 }), none, today);
  near(r.points[4].investments, 1000);
  near(r.points[5].investments, 81_000);
  near(r.points[6].investments, 81_000);
  assert.deepEqual(r.points[5].events, ['Windfall']);
});

test('a child costs money every year for 18 years, then stops', () => {
  const r = projectNetWorth(withEvents([ev('child', { age: 41, amount: 12_000, years: 18 })]), start({ cash: 1e6 }), none, today);
  near(r.points[0].cash, 1e6);
  near(r.points[1].cash, 1e6 - 12_000);
  near(r.points[18].cash, 1e6 - 18 * 12_000);
  near(r.points[30].cash, 1e6 - 18 * 12_000);
});

test('college costs run for the chosen number of years', () => {
  const r = projectNetWorth(withEvents([ev('college', { age: 50, amount: 20_000, years: 4 })]), start({ cash: 1e6 }), none, today);
  near(r.points[9].cash, 1e6);
  near(r.points[10].cash, 1e6 - 20_000);
  near(r.points[13].cash, 1e6 - 80_000);
  near(r.points[20].cash, 1e6 - 80_000);
});

test('event costs inflate like spending', () => {
  const r = projectNetWorth(withEvents([ev('expense', { age: 42, amount: 1000, years: 1 })], { inflation: 10 }), start({ cash: 1e6 }), none, today);
  // Age 42 is two years out: year one is today's money, so one year of inflation
  near(r.points[2].spending, 1100);
});

test('Social Security pays monthly from its start age, for life', () => {
  const r = projectNetWorth(withEvents([ev('socialSecurity', { age: 67, amount: 2000 })], { retireAge: 65 }), start({ cash: 1e6 }), { income: 0, spending: 30_000 }, today);
  near(r.points[26].cash, 1e6 - 26 * 30_000); // through age 66: no benefit yet
  near(r.points[27].cash, 1e6 - 26 * 30_000 - 30_000 + 24_000);
  near(r.points[28].cash, 1e6 - 26 * 30_000 - 2 * 30_000 + 48_000);
});

test('Social Security can keep money from running out', () => {
  const without = projectNetWorth(withEvents([], { birthYear: 1961 }), start({ investments: 200_000 }), { income: 0, spending: 30_000 }, today);
  const withSs = projectNetWorth(withEvents([ev('socialSecurity', { age: 67, amount: 2500 })], { birthYear: 1961 }), start({ investments: 200_000 }), { income: 0, spending: 30_000 }, today);
  assert.ok(without.runsOutAt != null);
  assert.equal(withSs.runsOutAt, null);
});

test('a career break pauses income for its length only', () => {
  const r = projectNetWorth(withEvents([ev('careerBreak', { age: 42, years: 2 })]), start({ cash: 1e6 }), { income: 100_000, spending: 60_000 }, today);
  assert.equal(r.points[1].income, 100_000);
  assert.equal(r.points[2].income, 0);
  assert.equal(r.points[3].income, 0);
  assert.equal(r.points[4].income, 100_000);
  near(r.points[3].cash, 1e6 + 40_000 - 2 * 60_000);
});

test('custom income and expenses can be one-time or recurring', () => {
  const r = projectNetWorth(
    withEvents([ev('income', { age: 41, amount: 5000, years: 3, label: 'Side gig' }), ev('expense', { age: 42, amount: 20_000, years: 1, id: 'x2', label: 'Roof' })]),
    start({ cash: 100_000 }), none, today);
  near(r.points[1].cash, 105_000);
  near(r.points[2].cash, 110_000 - 20_000);
  near(r.points[3].cash, 95_000);
  near(r.points[5].cash, 95_000);
  assert.deepEqual(r.points[1].events, ['Side gig']);
  assert.deepEqual(r.points[2].events, ['Roof']);
});

test('events that are already over are skipped', () => {
  const r = projectNetWorth(withEvents([ev('windfall', { age: 30, amount: 1e6 })]), start({ cash: 10 }), none, today);
  near(r.atEnd.cash, 10);
});

test('buying a home: down payment out, home in, mortgage owed then paid off', () => {
  const home = ev('home', { age: 42, amount: 400_000, downPayment: 80_000, years: 30, mortgageRate: 0 });
  const r = projectNetWorth(withEvents([home]), start({ cash: 100_000, investments: 0 }), none, today);
  near(r.points[1].property, 0);
  near(r.points[2].property, 400_000);
  near(r.points[2].cash, 20_000);
  near(r.points[2].debts, 320_000);
  near(r.points[2].netWorth, 100_000 - 80_000 + 400_000 - 320_000); // net worth only changes by what's spent
  // 0% over 30 years: 10,666.67 a year, but cash is only 20k, so savings run out and the plan reports it
  assert.ok(r.runsOutAt != null);
  assert.ok(r.points[3].debts < r.points[2].debts);
});

test('a mortgage with interest amortizes to zero at the end of its term', () => {
  const home = ev('home', { age: 41, amount: 300_000, downPayment: 60_000, years: 20, mortgageRate: 6 });
  const r = projectNetWorth(withEvents([home], { planToAge: 90 }), start({ cash: 50_000, investments: 5_000_000 }), none, today);
  near(r.points[1].debts, 240_000);
  assert.ok(r.points[2].debts < 240_000 * 1.06);
  near(r.points[21].debts, 0, 0.5);
  assert.equal(r.runsOutAt, null);
});

test('mortgagePayment matches the standard annuity formula', () => {
  near(mortgagePayment(100_000, 0, 10), 10_000);
  near(mortgagePayment(200_000, 6, 30), 14_529.78, 0.5);
  assert.equal(mortgagePayment(0, 5, 10), 0);
});

test('a home grows at the real estate rate', () => {
  const home = ev('home', { age: 41, amount: 100_000, downPayment: 100_000 });
  const r = projectNetWorth(withEvents([home], { growth: { ...flat, realEstate: 5 } }), start({ cash: 100_000 }), none, today);
  near(r.points[1].property, 100_000);
  near(r.points[3].property, 100_000 * 1.05 ** 2);
});

test('sanitizePlan cleans events and drops junk', () => {
  const p = sanitizePlan({ events: [
    { type: 'windfall', age: '45', amount: '1000', label: '  Bonus  ' },
    { type: 'nonsense' },
    'oops',
    { type: 'child', id: 'a', years: 500, enabled: false },
    { type: 'child', id: 'a' },
  ] });
  assert.equal(p.events.length, 4 - 1);
  assert.equal(p.events[0].age, 45);
  assert.equal(p.events[0].amount, 1000);
  assert.equal(p.events[0].label, 'Bonus');
  assert.equal(p.events[1].years, 60);
  assert.equal(p.events[1].enabled, false);
  assert.notEqual(p.events[1].id, p.events[2].id);
  assert.deepEqual(sanitizePlan({ events: 'x' }).events, []);
  assert.equal(sanitizePlan({ events: Array.from({ length: 100 }, () => ({ type: 'windfall' })) }).events.length, 30);
});
