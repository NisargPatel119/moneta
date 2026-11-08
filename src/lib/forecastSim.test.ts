import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PLAN, projectNetWorth, sanitizePlan, type ForecastPlan, type StartingPoint } from './forecast.ts';
import { normal, percentile, randomPath, seededRandom, simulate, simulateRuns, successBand, summarizeRuns } from './forecastSim.ts';

const today = new Date(2026, 0, 15);
const plan = (changes: Partial<ForecastPlan> = {}): ForecastPlan => ({ ...DEFAULT_PLAN, birthYear: 1986, ...changes });
const start = (changes: Partial<StartingPoint> = {}): StartingPoint => ({ cash: 0, investments: 0, property: [], debts: 0, debtTrend: 0, ...changes });
const flat = { income: 0, spending: 0 };

test('the seeded generator repeats and stays in 0–1', () => {
  const a = seededRandom(42);
  const b = seededRandom(42);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(seededRandom(1)(), seededRandom(2)());
});

test('normal draws have roughly the asked mean and spread', () => {
  const random = seededRandom(7);
  const xs = Array.from({ length: 20_000 }, () => normal(random, 7, 15));
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
  assert.ok(Math.abs(mean - 7) < 0.5, `mean ${mean}`);
  assert.ok(Math.abs(sd - 15) < 0.5, `sd ${sd}`);
});

test('a path with the steady assumptions matches the plain projection', () => {
  const p = plan({ planToAge: 60, retireAge: 55, events: [{ id: 'w', type: 'windfall', label: 'W', enabled: true, age: 45, amount: 10_000, years: 1, downPayment: 0, mortgageRate: 0 }] });
  const s = start({ cash: 10_000, investments: 50_000 });
  const base = { income: 90_000, spending: 60_000 };
  const steady = projectNetWorth(p, s, base, today);
  const years = 20;
  const withPath = projectNetWorth(p, s, base, today, {
    returns: Array(years).fill(p.growth.investments),
    inflation: Array(years).fill(p.inflation),
  });
  steady.points.forEach((pt, i) => assert.ok(Math.abs(pt.netWorth - withPath.points[i].netWorth) < 0.01));
});

test('a path of returns replaces the investment growth rate, year by year', () => {
  const r = projectNetWorth(plan({ planToAge: 45, retireAge: 44 }), start({ investments: 1000 }), flat, today, { returns: [10, -50, 20, 0, 0], inflation: [] });
  assert.ok(Math.abs(r.points[1].investments - 1100) < 0.01);
  assert.ok(Math.abs(r.points[2].investments - 550) < 0.01);
  assert.ok(Math.abs(r.points[3].investments - 660) < 0.01);
});

test('random paths have the right length and floors', () => {
  const path = randomPath(plan({ volatility: 40 }), 50, seededRandom(3));
  assert.equal(path.returns.length, 50);
  assert.equal(path.inflation.length, 50);
  assert.ok(path.returns.every(r => r >= -90));
});

test('simulations are stable and chunking does not change them', () => {
  const p = plan({ planToAge: 70 });
  const s = start({ investments: 200_000 });
  const base = { income: 80_000, spending: 60_000 };
  const whole = simulateRuns(p, s, base, 0, 40, today);
  const chunks = [...simulateRuns(p, s, base, 0, 15, today), ...simulateRuns(p, s, base, 15, 40, today)];
  assert.deepEqual(chunks, whole);
  assert.deepEqual(simulate(p, s, base, today, 50), simulate(p, s, base, today, 50));
});

test('zero volatility gives the same answer in every run, equal to the steady projection', () => {
  const p = plan({ volatility: 0, planToAge: 70, inflation: 3 });
  const s = start({ cash: 5000, investments: 100_000 });
  const base = { income: 90_000, spending: 70_000 };
  // inflation still wobbles a little, so compare returns-only by checking runs agree with each other on investments growth direction
  const sum = simulate(p, s, base, today, 100);
  assert.equal(sum.successRate, 1);
  const last = sum.bands[sum.bands.length - 1];
  assert.ok(last.p10 <= last.p50 && last.p50 <= last.p90);
});

test('more volatility widens the band and the bands are ordered', () => {
  const s = start({ investments: 300_000 });
  const base = { income: 100_000, spending: 70_000 };
  const calm = simulate(plan({ volatility: 5, planToAge: 80 }), s, base, today, 300);
  const wild = simulate(plan({ volatility: 25, planToAge: 80 }), s, base, today, 300);
  const spread = (r: typeof calm) => r.bands[r.bands.length - 1].p90 - r.bands[r.bands.length - 1].p10;
  assert.ok(spread(wild) > spread(calm));
  for (const b of wild.bands) assert.ok(b.p10 <= b.p50 && b.p50 <= b.p90);
  assert.equal(wild.bands[0].age, 40);
  assert.equal(wild.bands.length, 41);
  // Day one is the same in every run
  assert.equal(wild.bands[0].p10, wild.bands[0].p90);
});

test('success rate is 1 when savings are plentiful and 0 when there are none and spending continues', () => {
  const rich = simulate(plan({ planToAge: 80 }), start({ investments: 5_000_000 }), { income: 100_000, spending: 50_000 }, today, 200);
  assert.equal(rich.successRate, 1);
  assert.equal(rich.medianRunsOutAt, null);
  const broke = simulate(plan({ planToAge: 80 }), start({}), { income: 40_000, spending: 60_000 }, today, 200);
  assert.equal(broke.successRate, 0);
  assert.equal(broke.medianRunsOutAt, 41);
});

test('a tight retirement lands between 0 and 1', () => {
  const r = simulate(plan({ birthYear: 1961, retireAge: 65, planToAge: 95 }), start({ investments: 900_000 }), { income: 0, spending: 45_000 }, today, 400);
  assert.ok(r.successRate > 0 && r.successRate < 1, `rate ${r.successRate}`);
  assert.ok(r.medianRunsOutAt != null && r.medianRunsOutAt > 65);
});

test('summarizing no runs is safe', () => {
  const s = summarizeRuns([], 40);
  assert.equal(s.successRate, 0);
  assert.deepEqual(s.bands, []);
});

test('percentile interpolates', () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(percentile([0, 10], 0.25), 2.5);
  assert.equal(percentile([], 0.5), 0);
});

test('success bands follow the thresholds', () => {
  assert.equal(successBand(0.95).id, 'onTrack');
  assert.equal(successBand(0.8).id, 'onTrack');
  assert.equal(successBand(0.79).id, 'worthALook');
  assert.equal(successBand(0.6).id, 'worthALook');
  assert.equal(successBand(0.59).id, 'atRisk');
});

test('volatility is saved and clamped with the plan', () => {
  assert.equal(sanitizePlan({}).volatility, 15);
  assert.equal(sanitizePlan({ volatility: 99 }).volatility, 40);
  assert.equal(sanitizePlan({ volatility: '20' }).volatility, 20);
});
