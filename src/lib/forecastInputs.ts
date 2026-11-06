import { type DashboardData, dayKey, inRange, parseDay, sumIncome, sumSpending } from './finance';
import type { TxnRules } from './transfers';
import { monthBounds, monthKey } from './insights';
import { projectNetWorth, type ForecastPlan, type ForecastResult, type StartingPoint } from './forecast';

// Yearly income and spending from the last 12 complete months that have any transactions
// (fewer if history is shorter, scaled up to a year)
export function yearlyBaseline(data: DashboardData, rules: TxnRules) {
  let income = 0;
  let spending = 0;
  let months = 0;
  for (let offset = -1; offset >= -12; offset--) {
    const range = monthBounds(monthKey(offset));
    const txns = data.transactions.filter(t => inRange(t, range));
    if (txns.length === 0) continue;
    income += sumIncome(txns);
    spending += sumSpending(txns, rules);
    months++;
  }
  return {
    income: months ? Math.round((income / months) * 12) : 0,
    spending: months ? Math.round((spending / months) * 12) : 0,
    months,
  };
}

export function startingPoint(data: DashboardData, plan: ForecastPlan): StartingPoint {
  let cash = 0;
  let investments = 0;
  let debts = 0;
  const property: StartingPoint['property'] = [];
  for (const a of data.accounts) {
    const bal = a.balances.current ?? 0;
    if (a.type === 'depository') cash += bal;
    else if (a.type === 'investment') investments += bal;
    else if (a.type === 'credit' || a.type === 'loan') debts += bal;
    else property.push({ value: bal, rate: plan.growth.other });
  }
  for (const asset of data.manualAssets ?? []) {
    const planRate = asset.kind === 'real_estate' ? plan.growth.realEstate
      : asset.kind === 'vehicle' ? plan.growth.vehicles
      : asset.kind === 'cash' ? plan.growth.cash
      : asset.kind === 'investment' ? plan.growth.investments
      : plan.growth.other;
    property.push({ value: asset.value, rate: asset.annual_rate ?? planRate });
  }
  return { cash, investments, property, debts, debtTrend: loanTrend(data) };
}

// How fast loans have been shrinking per year, from balance history (0 if growing or unknown).
// Credit card balances swing month to month, so only loans count.
function loanTrend(data: DashboardData) {
  const history = data.history ?? [];
  if (history.length < 2) return 0;
  const last = history[history.length - 1];
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const first = history.find(p => p.date >= dayKey(yearAgo)) ?? history[0];
  const days = (parseDay(last.date).getTime() - parseDay(first.date).getTime()) / 86_400_000;
  if (days < 60) return 0;
  const perYear = ((last.byBucket?.loans ?? 0) - (first.byBucket?.loans ?? 0)) * (365 / days);
  return Math.min(0, perYear);
}

export function forecastFor(data: DashboardData, rules: TxnRules, plan: ForecastPlan): ForecastResult & { baseline: ReturnType<typeof yearlyBaseline> } {
  const baseline = yearlyBaseline(data, rules);
  return { ...projectNetWorth(plan, startingPoint(data, plan), baseline), baseline };
}
