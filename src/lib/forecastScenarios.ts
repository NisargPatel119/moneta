// Saved forecast scenarios and the "what if" preview. A scenario is a named copy of the plan with some
// changes. Pure functions, no React or database (see forecastScenarios.test.ts).
import { sanitizePlan, type ForecastPlan } from './forecast.ts';

export const MAX_SCENARIOS = 10;
/** How many lines the comparison chart shows at once */
export const MAX_COMPARE = 3;

export type ForecastScenario = {
  id: string;
  name: string;
  /** The whole plan as it is in this scenario */
  plan: ForecastPlan;
};

export function sanitizeScenarios(input: unknown): ForecastScenario[] {
  if (!Array.isArray(input)) return [];
  const out: ForecastScenario[] = [];
  const seen = new Set<string>();
  for (const item of input.slice(0, MAX_SCENARIOS)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    let id = typeof r.id === 'string' && r.id ? r.id.slice(0, 40) : `s${out.length + 1}`;
    while (seen.has(id)) id += 'x';
    seen.add(id);
    const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : `Scenario ${out.length + 1}`;
    out.push({ id, name, plan: sanitizePlan(r.plan) });
  }
  return out;
}

export type Baseline = { income: number; spending: number };

/** What the plan puts away each month: a surplus (after the saved share) or, if negative, the shortfall */
export function monthlySavings(plan: ForecastPlan, baseline: Baseline) {
  const surplus = (plan.income ?? baseline.income) - (plan.spending ?? baseline.spending);
  return (surplus >= 0 ? surplus * (plan.savedShare / 100) : surplus) / 12;
}

// Changes the retirement age. A "retire" life event would win over the plan's age, so it moves too.
export function withRetireAge(plan: ForecastPlan, age: number): ForecastPlan {
  return sanitizePlan({
    ...plan,
    retireAge: age,
    events: plan.events.map(e => (e.type === 'retire' ? { ...e, age } : e)),
  });
}

// Sets how much is saved per month by adjusting spending (income stays put) and saving all of it
export function withMonthlySavings(plan: ForecastPlan, baseline: Baseline, perMonth: number): ForecastPlan {
  const income = plan.income ?? baseline.income;
  return sanitizePlan({ ...plan, income, spending: Math.max(0, Math.round(income - perMonth * 12)), savedShare: 100 });
}

export type WhatIf = { retireAge: number; monthlySavings: number };

export function applyWhatIf(plan: ForecastPlan, baseline: Baseline, w: WhatIf): ForecastPlan {
  return withMonthlySavings(withRetireAge(plan, w.retireAge), baseline, w.monthlySavings);
}

// The plan's own retirement age, including a life event that moves it
export function effectiveRetireAge(plan: ForecastPlan) {
  const e = plan.events.find(x => x.enabled && x.type === 'retire');
  return e ? e.age : plan.retireAge;
}

// Short plain-language list of how a scenario differs from the plan it's compared with
export function describeChanges(base: ForecastPlan, scenario: ForecastPlan, baseline: Baseline): string[] {
  const out: string[] = [];
  const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
  const ra = effectiveRetireAge(base);
  const rb = effectiveRetireAge(scenario);
  if (ra !== rb) out.push(`Retire at ${rb} (not ${ra})`);
  if (base.planToAge !== scenario.planToAge) out.push(`Plan to age ${scenario.planToAge}`);
  const sa = Math.round(monthlySavings(base, baseline));
  const sb = Math.round(monthlySavings(scenario, baseline));
  if (sa !== sb) out.push(`Saves ${money(sb)}/month (not ${money(sa)})`);
  if (base.growth.investments !== scenario.growth.investments) out.push(`Investments grow ${scenario.growth.investments}%`);
  if (base.inflation !== scenario.inflation) out.push(`Inflation ${scenario.inflation}%`);
  const onIds = (p: ForecastPlan) => new Set(p.events.filter(e => e.enabled).map(e => e.id));
  const a = onIds(base);
  const b = onIds(scenario);
  for (const e of scenario.events) if (e.enabled && !a.has(e.id)) out.push(`Adds ${e.label} at ${e.age}`);
  for (const e of base.events) if (e.enabled && !b.has(e.id)) out.push(`Without ${e.label}`);
  return out;
}

// Merges several projections onto one list of ages for a multi-line chart. Each row has `age` and one
// value per series (keyed by series id); a series that has ended (shorter plan) leaves its key out.
export function mergeSeries(series: { id: string; points: { age: number; value: number }[] }[]) {
  const byAge = new Map<number, Record<string, number>>();
  for (const s of series) {
    for (const p of s.points) {
      const row = byAge.get(p.age) ?? {};
      row[s.id] = p.value;
      byAge.set(p.age, row);
    }
  }
  return [...byAge.entries()].sort((x, y) => x[0] - y[0]).map(([age, row]) => ({ age, ...row }));
}

/** A new id that isn't taken yet */
export function newScenarioId(existing: ForecastScenario[], now = Date.now()) {
  let id = `s${now.toString(36)}`;
  while (existing.some(s => s.id === id)) id += 'x';
  return id;
}
