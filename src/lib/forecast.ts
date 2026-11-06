// Net worth forecast: a yearly projection from today to the age the plan runs to.
// Pure functions, no React or database, so it's easy to test (see forecast.test.ts).

export type GrowthRates = {
  /** Yearly change in percent */
  cash: number;
  investments: number;
  realEstate: number;
  vehicles: number;
  other: number;
};

export type ForecastPlan = {
  /** null until the user tells us; the forecast needs an age to start from */
  birthYear: number | null;
  retireAge: number;
  planToAge: number;
  /** Yearly take-home income and spending. null = use the last 12 months of transactions. */
  income: number | null;
  spending: number | null;
  /** Yearly raise, in percent */
  incomeGrowth: number;
  /** Share of a yearly surplus that actually gets saved, 0–100 */
  savedShare: number;
  inflation: number;
  growth: GrowthRates;
};

export const DEFAULT_PLAN: ForecastPlan = {
  birthYear: null,
  retireAge: 65,
  planToAge: 90,
  income: null,
  spending: null,
  incomeGrowth: 3,
  savedShare: 100,
  inflation: 3,
  // Monarch's published defaults; Origin's are similar
  growth: { cash: 3, investments: 7, realEstate: 3, vehicles: -15, other: 0 },
};

// Fill in defaults and clamp anything out of range (used for data from the database or the browser)
export function sanitizePlan(input: unknown): ForecastPlan {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  // null (or blank) means "work it out from my transactions"
  const nullableNum = (v: unknown, min: number, max: number) => {
    if (v == null || v === '') return null;
    const n = num(v, NaN, min, max);
    return Number.isFinite(n) ? n : null;
  };
  const thisYear = new Date().getFullYear();
  const g = (raw.growth && typeof raw.growth === 'object' ? raw.growth : {}) as Record<string, unknown>;

  const birthYear = raw.birthYear == null || raw.birthYear === '' ? null : Math.round(num(raw.birthYear, NaN, thisYear - 100, thisYear - 14));
  const retireAge = Math.round(num(raw.retireAge, DEFAULT_PLAN.retireAge, 30, 85));
  return {
    birthYear: Number.isFinite(birthYear as number) ? birthYear : null,
    retireAge,
    planToAge: Math.max(retireAge + 1, Math.round(num(raw.planToAge, DEFAULT_PLAN.planToAge, 60, 110))),
    income: nullableNum(raw.income, 0, 1e8),
    spending: nullableNum(raw.spending, 0, 1e8),
    incomeGrowth: num(raw.incomeGrowth, DEFAULT_PLAN.incomeGrowth, -10, 20),
    savedShare: num(raw.savedShare, DEFAULT_PLAN.savedShare, 0, 100),
    inflation: num(raw.inflation, DEFAULT_PLAN.inflation, 0, 15),
    growth: {
      cash: num(g.cash, DEFAULT_PLAN.growth.cash, -20, 20),
      investments: num(g.investments, DEFAULT_PLAN.growth.investments, -20, 30),
      realEstate: num(g.realEstate, DEFAULT_PLAN.growth.realEstate, -20, 20),
      vehicles: num(g.vehicles, DEFAULT_PLAN.growth.vehicles, -50, 10),
      other: num(g.other, DEFAULT_PLAN.growth.other, -50, 30),
    },
  };
}

/** Today's balances, grouped the way the forecast grows them */
export type StartingPoint = {
  cash: number;
  investments: number;
  /** Each manual asset grows at its own rate (or the plan's rate for its kind) */
  property: { value: number; rate: number }[];
  /** Credit cards and loans, owed (positive) */
  debts: number;
  /** Yearly change in debts from recent history (negative = paying down), 0 if unknown */
  debtTrend: number;
};

export type ForecastPoint = {
  age: number;
  year: number;
  cash: number;
  investments: number;
  property: number;
  debts: number;
  netWorth: number;
  /** Income and spending during the year that ends at this point */
  income: number;
  spending: number;
};

export type ForecastResult = {
  currentAge: number;
  points: ForecastPoint[];
  /** First age at which cash and investments can't cover spending, or null if they last */
  runsOutAt: number | null;
  atRetirement: ForecastPoint | null;
  atEnd: ForecastPoint;
};

export function currentAgeOf(birthYear: number, today = new Date()) {
  return today.getFullYear() - birthYear;
}

// One step per year. Before retirement, the saved share of (income − spending) is added to cash and
// investments in today's proportions; a shortfall is drawn from them. After retirement income stops and
// spending comes out of cash first, then investments. Money that runs out stays at zero (spending
// beyond that is unfunded), while property and debts carry on.
export function projectNetWorth(plan: ForecastPlan, start: StartingPoint, baseline: { income: number; spending: number }, today = new Date()): ForecastResult {
  const birthYear = plan.birthYear ?? today.getFullYear() - 40;
  const currentAge = currentAgeOf(birthYear, today);
  const year0 = today.getFullYear();
  const rate = (pct: number) => pct / 100;

  let cash = Math.max(0, start.cash);
  let investments = Math.max(0, start.investments);
  let property = start.property.map(p => ({ ...p }));
  let debts = Math.max(0, start.debts);
  const liquid0 = cash + investments;
  // Where new savings go: today's mix, or all to investments if there's nothing yet
  const cashShare = liquid0 > 0 ? cash / liquid0 : 0;

  let income = plan.income ?? baseline.income;
  let spending = plan.spending ?? baseline.spending;
  let runsOutAt: number | null = null;

  const point = (age: number, yearIncome: number, yearSpending: number): ForecastPoint => {
    const propertyTotal = property.reduce((s, p) => s + p.value, 0);
    return {
      age,
      year: year0 + (age - currentAge),
      cash,
      investments,
      property: propertyTotal,
      debts,
      netWorth: cash + investments + propertyTotal - debts,
      income: yearIncome,
      spending: yearSpending,
    };
  };

  const points: ForecastPoint[] = [point(currentAge, 0, 0)];

  for (let age = currentAge + 1; age <= plan.planToAge; age++) {
    const working = age <= plan.retireAge;
    const yearIncome = working ? income : 0;
    const yearSpending = spending;

    // Growth on what was there at the start of the year
    cash *= 1 + rate(plan.growth.cash);
    investments *= 1 + rate(plan.growth.investments);
    property = property.map(p => ({ ...p, value: Math.max(0, p.value * (1 + rate(p.rate))) }));
    debts = Math.max(0, debts + start.debtTrend);

    const surplus = yearIncome - yearSpending;
    if (surplus >= 0) {
      const saved = surplus * (plan.savedShare / 100);
      cash += saved * cashShare;
      investments += saved * (1 - cashShare);
    } else {
      // Draw the shortfall from cash first, then investments
      let need = -surplus;
      const fromCash = Math.min(cash, need);
      cash -= fromCash;
      need -= fromCash;
      const fromInvestments = Math.min(investments, need);
      investments -= fromInvestments;
      need -= fromInvestments;
      if (need > 0.5 && runsOutAt == null) runsOutAt = age;
    }

    points.push(point(age, yearIncome, yearSpending));

    // Next year's amounts
    if (working) income *= 1 + rate(plan.incomeGrowth);
    spending *= 1 + rate(plan.inflation);
  }

  return {
    currentAge,
    points,
    runsOutAt,
    atRetirement: points.find(p => p.age === plan.retireAge) ?? null,
    atEnd: points[points.length - 1],
  };
}

// Converts a future amount to today's dollars
export function inTodaysDollars(value: number, yearsFromNow: number, inflationPct: number) {
  return value / Math.pow(1 + inflationPct / 100, yearsFromNow);
}
