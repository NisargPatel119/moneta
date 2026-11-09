import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PLAN, projectNetWorth, newEvent, type ForecastPlan, type StartingPoint } from './forecast.ts';
import {
  MAX_SCENARIOS, applyWhatIf, describeChanges, effectiveRetireAge, mergeSeries, monthlySavings, newScenarioId,
  sanitizeScenarios, withMonthlySavings, withRetireAge,
} from './forecastScenarios.ts';

const today = new Date(2026, 0, 15);
const plan = (changes: Partial<ForecastPlan> = {}): ForecastPlan => ({ ...DEFAULT_PLAN, birthYear: 1986, ...changes });
const start: StartingPoint = { cash: 20_000, investments: 80_000, property: [], debts: 0, debtTrend: 0 };
const baseline = { income: 100_000, spending: 70_000 };

test('monthlySavings is the saved share of the surplus, or the shortfall', () => {
  assert.equal(monthlySavings(plan(), baseline), 2500);
  assert.equal(monthlySavings(plan({ savedShare: 50 }), baseline), 1250);
  assert.equal(monthlySavings(plan({ spending: 120_000 }), baseline), -(20_000 / 12));
});

test('withMonthlySavings changes spending and saves it all', () => {
  const p = withMonthlySavings(plan({ savedShare: 50 }), baseline, 4000);
  assert.equal(p.income, 100_000);
  assert.equal(p.spending, 52_000);
  assert.equal(p.savedShare, 100);
  assert.equal(monthlySavings(p, baseline), 4000);
});

test('saving more per month grows net worth at retirement', () => {
  const base = projectNetWorth(plan(), start, baseline, today);
  const more = projectNetWorth(withMonthlySavings(plan(), baseline, 4000), start, baseline, today);
  assert.ok(more.atEnd.netWorth > base.atEnd.netWorth);
});

test('withRetireAge moves the plan and a retire event, and keeps plan-to age above it', () => {
  const retire = { ...newEvent('retire', 40, 65), id: 'r', age: 60 };
  const p = withRetireAge(plan({ events: [retire] }), 55);
  assert.equal(p.retireAge, 55);
  assert.equal(p.events[0].age, 55);
  assert.equal(effectiveRetireAge(p), 55);
  assert.ok(withRetireAge(plan({ planToAge: 70 }), 80).planToAge > 80);
});

test('retiring later gives a larger nest egg at retirement', () => {
  const early = projectNetWorth(withRetireAge(plan(), 55), start, baseline, today);
  const late = projectNetWorth(withRetireAge(plan(), 67), start, baseline, today);
  assert.equal(early.retireAge, 55);
  assert.equal(late.retireAge, 67);
  assert.ok(late.atRetirement!.netWorth > early.atRetirement!.netWorth);
});

test('applyWhatIf does not change the original plan', () => {
  const original = plan();
  const copy = JSON.stringify(original);
  const p = applyWhatIf(original, baseline, { retireAge: 58, monthlySavings: 3000 });
  assert.equal(JSON.stringify(original), copy);
  assert.equal(p.retireAge, 58);
  assert.equal(monthlySavings(p, baseline), 3000);
});

test('describeChanges lists what differs', () => {
  const home = { ...newEvent('home', 40, 65), id: 'h', label: 'Buy a home', age: 42 };
  const base = plan();
  assert.deepEqual(describeChanges(base, base, baseline), []);
  const changed = withRetireAge(plan({ events: [home] }), 58);
  const notes = describeChanges(base, changed, baseline);
  assert.ok(notes.includes('Retire at 58 (not 65)'));
  assert.ok(notes.includes('Adds Buy a home at 42'));
  assert.deepEqual(describeChanges(plan({ events: [home] }), plan({ events: [{ ...home, enabled: false }] }), baseline), ['Without Buy a home']);
});

test('sanitizeScenarios cleans names, ids and plans, and caps the list', () => {
  assert.deepEqual(sanitizeScenarios(null), []);
  assert.deepEqual(sanitizeScenarios('nope'), []);
  const out = sanitizeScenarios([
    { id: 'a', name: '  Retire at 55  ', plan: { retireAge: 55, birthYear: 1986 } },
    { id: 'a', name: '', plan: { retireAge: 500 } },
    null,
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 'Retire at 55');
  assert.equal(out[0].plan.retireAge, 55);
  assert.notEqual(out[1].id, 'a');
  assert.equal(out[1].name, 'Scenario 2');
  assert.equal(out[1].plan.retireAge, 85);
  const many = sanitizeScenarios(Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, plan: {} })));
  assert.equal(many.length, MAX_SCENARIOS);
});

test('mergeSeries aligns ages and leaves out a series that has ended', () => {
  const rows = mergeSeries([
    { id: 'a', points: [{ age: 40, value: 1 }, { age: 41, value: 2 }, { age: 42, value: 3 }] },
    { id: 'b', points: [{ age: 41, value: 20 }, { age: 40, value: 10 }] },
  ]);
  assert.deepEqual(rows, [{ age: 40, a: 1, b: 10 }, { age: 41, a: 2, b: 20 }, { age: 42, a: 3 }]);
});

test('newScenarioId avoids ids already in use', () => {
  const id = newScenarioId([], 12345);
  assert.notEqual(newScenarioId([{ id, name: 'x', plan: plan() }], 12345), id);
});
