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

export type EventType =
  | 'retire' | 'home' | 'child' | 'college' | 'windfall' | 'socialSecurity' | 'careerBreak' | 'income' | 'expense';

// One life event. A single flat shape keeps saving and editing simple; which fields matter depends on
// the type (see EVENT_META). All money is in today's dollars and grows with inflation up to the event.
export type LifeEvent = {
  id: string;
  type: EventType;
  /** Shown in the list and on the chart */
  label: string;
  enabled: boolean;
  /** Your age when it starts (for "retire", the new retirement age) */
  age: number;
  /** Home: price. Child / college / custom: per year. Windfall: the one-time amount. Social Security: per month. */
  amount: number;
  /** Home: mortgage term. Child: years of costs. College / career break / custom: how long (1 = one-time). */
  years: number;
  /** Home only */
  downPayment: number;
  /** Home only: mortgage interest, percent per year */
  mortgageRate: number;
};

export const EVENT_META: Record<EventType, { label: string; hint: string }> = {
  retire: { label: 'Retire', hint: 'Moves your retirement age' },
  home: { label: 'Buy a home', hint: 'Down payment from savings, the rest as a mortgage' },
  child: { label: 'Have a child', hint: 'Yearly cost until they turn 18' },
  college: { label: 'College', hint: 'Yearly cost for a few years' },
  windfall: { label: 'Windfall', hint: 'A one-time amount, like an inheritance or bonus' },
  socialSecurity: { label: 'Social Security', hint: 'Monthly benefit from the age you start' },
  careerBreak: { label: 'Career break', hint: 'Your income pauses' },
  income: { label: 'Extra income', hint: 'One-time or yearly money coming in' },
  expense: { label: 'Extra expense', hint: 'One-time or yearly money going out' },
};

// A sensible starting event of each type, for the "add" sheet
export function newEvent(type: EventType, currentAge: number, retireAge: number): LifeEvent {
  const base: LifeEvent = { id: '', type, label: EVENT_META[type].label, enabled: true, age: currentAge + 3, amount: 0, years: 1, downPayment: 0, mortgageRate: 6.5 };
  switch (type) {
    case 'retire': return { ...base, age: Math.max(currentAge + 1, retireAge - 5) };
    case 'home': return { ...base, amount: 450_000, downPayment: 90_000, years: 30 };
    case 'child': return { ...base, amount: 15_000, years: 18 };
    case 'college': return { ...base, age: currentAge + 15, amount: 25_000, years: 4 };
    case 'windfall': return { ...base, label: 'Windfall', amount: 50_000 };
    case 'socialSecurity': return { ...base, age: 67, amount: 2_500, years: 0 };
    case 'careerBreak': return { ...base, age: currentAge + 5 };
    case 'income': return { ...base, amount: 10_000 };
    case 'expense': return { ...base, amount: 10_000 };
  }
}

export const MAX_EVENTS = 30;

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
  /** How much investment returns swing from year to year in the simulations (standard deviation, percent) */
  volatility: number;
  growth: GrowthRates;
  /** Home purchases, kids, windfalls and so on (see LifeEvent) */
  events: LifeEvent[];
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
  volatility: 15,
  // Monarch's published defaults; Origin's are similar
  growth: { cash: 3, investments: 7, realEstate: 3, vehicles: -15, other: 0 },
  events: [],
};

function sanitizeEvents(input: unknown): LifeEvent[] {
  if (!Array.isArray(input)) return [];
  const types = Object.keys(EVENT_META) as EventType[];
  const out: LifeEvent[] = [];
  const seen = new Set<string>();
  for (const item of input.slice(0, MAX_EVENTS)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (!types.includes(r.type as EventType)) continue;
    const type = r.type as EventType;
    const num = (v: unknown, fallback: number, min: number, max: number) => {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };
    let id = typeof r.id === 'string' && r.id ? r.id.slice(0, 40) : `e${out.length + 1}`;
    while (seen.has(id)) id += 'x';
    seen.add(id);
    const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 40) : EVENT_META[type].label;
    out.push({
      id,
      type,
      label,
      enabled: r.enabled !== false,
      age: Math.round(num(r.age, 40, 14, 110)),
      amount: num(r.amount, 0, 0, 1e9),
      years: Math.round(num(r.years, 1, 0, 60)),
      downPayment: num(r.downPayment, 0, 0, 1e9),
      mortgageRate: num(r.mortgageRate, 6.5, 0, 25),
    });
  }
  return out;
}

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
    volatility: num(raw.volatility, DEFAULT_PLAN.volatility, 0, 40),
    growth: {
      cash: num(g.cash, DEFAULT_PLAN.growth.cash, -20, 20),
      investments: num(g.investments, DEFAULT_PLAN.growth.investments, -20, 30),
      realEstate: num(g.realEstate, DEFAULT_PLAN.growth.realEstate, -20, 20),
      vehicles: num(g.vehicles, DEFAULT_PLAN.growth.vehicles, -50, 10),
      other: num(g.other, DEFAULT_PLAN.growth.other, -50, 30),
    },
    events: sanitizeEvents(raw.events),
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
  /** Labels of life events that start at this age */
  events: string[];
};

export type ForecastResult = {
  currentAge: number;
  /** The age income stops: the plan's, unless an enabled "retire" event moves it */
  retireAge: number;
  points: ForecastPoint[];
  /** First age at which cash and investments can't cover spending, or null if they last */
  runsOutAt: number | null;
  atRetirement: ForecastPoint | null;
  atEnd: ForecastPoint;
};

export function currentAgeOf(birthYear: number, today = new Date()) {
  return today.getFullYear() - birthYear;
}

// Yearly payment that pays off a loan over `years` (0% interest just splits the principal)
export function mortgagePayment(principal: number, ratePct: number, years: number) {
  const n = Math.max(1, years);
  const r = ratePct / 100;
  if (principal <= 0) return 0;
  return r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
}

// One step per year. Before retirement, the saved share of (income − spending) is added to cash and
// investments in today's proportions; a shortfall is drawn from them. After retirement income stops and
// spending comes out of cash first, then investments. Money that runs out stays at zero (spending
// beyond that is unfunded), while property and debts carry on.
//
// Life events change a year's flows on top of that. Their money is in today's dollars and is inflated
// like spending. Event money is never trimmed by the saved share: a windfall goes in whole (split like
// savings), costs are drawn from cash, then investments. A home purchase takes the down payment from
// savings, adds the home as property and the rest as a mortgage that's paid off over its term.
//
// `path` swaps the steady assumptions for one year-by-year sequence (index 0 = the first year): investment
// returns and inflation in percent. The simulations use it; without it the projection is the steady one.
export type ReturnPath = { returns: number[]; inflation: number[] };

export function projectNetWorth(plan: ForecastPlan, start: StartingPoint, baseline: { income: number; spending: number }, today = new Date(), path?: ReturnPath): ForecastResult {
  const birthYear = plan.birthYear ?? today.getFullYear() - 40;
  const currentAge = currentAgeOf(birthYear, today);
  const year0 = today.getFullYear();
  const rate = (pct: number) => pct / 100;
  const events = plan.events.filter(e => e.enabled);
  const retireEvent = events.find(e => e.type === 'retire');
  const retireAge = retireEvent ? Math.min(Math.max(retireEvent.age, 30), plan.planToAge - 1) : plan.retireAge;

  let cash = Math.max(0, start.cash);
  let investments = Math.max(0, start.investments);
  let property = start.property.map(p => ({ ...p }));
  let debts = Math.max(0, start.debts);
  // Mortgages from home purchases, tracked on their own so the debt trend doesn't touch them
  let mortgages: { balance: number; rate: number; payment: number }[] = [];
  const liquid0 = cash + investments;
  // Where new savings go: today's mix, or all to investments if there's nothing yet
  const cashShare = liquid0 > 0 ? cash / liquid0 : 0;

  let income = plan.income ?? baseline.income;
  let spending = plan.spending ?? baseline.spending;
  let runsOutAt: number | null = null;
  // Prices today = 1; grows with each year's inflation
  let priceLevel = 1;

  const point = (age: number, yearIncome: number, yearSpending: number, labels: string[]): ForecastPoint => {
    const propertyTotal = property.reduce((s, p) => s + p.value, 0);
    const owed = debts + mortgages.reduce((s, m) => s + m.balance, 0);
    return {
      age,
      year: year0 + (age - currentAge),
      cash,
      investments,
      property: propertyTotal,
      debts: owed,
      netWorth: cash + investments + propertyTotal - owed,
      income: yearIncome,
      spending: yearSpending,
      events: labels,
    };
  };

  const points: ForecastPoint[] = [point(currentAge, 0, 0, [])];

  for (let age = currentAge + 1; age <= plan.planToAge; age++) {
    const working = age <= retireAge;

    const yearIndex = age - currentAge - 1;
    const inflationPct = path?.inflation[yearIndex] ?? plan.inflation;

    // Growth on what was there at the start of the year
    cash *= 1 + rate(plan.growth.cash);
    investments *= 1 + rate(path?.returns[yearIndex] ?? plan.growth.investments);
    property = property.map(p => ({ ...p, value: Math.max(0, p.value * (1 + rate(p.rate))) }));
    debts = Math.max(0, debts + start.debtTrend);

    // Life events this year. Amounts are in today's dollars, inflated like spending (year one = today).
    const inflate = priceLevel;
    const labels: string[] = [];
    let eventIn = 0;
    let eventOut = 0;
    let onBreak = false;

    // Pay this year's installment on mortgages from earlier purchases
    mortgages = mortgages
      .map(m => {
        const owing = m.balance * (1 + rate(m.rate));
        const paid = Math.min(m.payment, owing);
        eventOut += paid;
        return { ...m, balance: owing - paid };
      })
      .filter(m => m.balance > 0.5);

    for (const e of events) {
      const starts = age === e.age;
      const within = age >= e.age && age < e.age + Math.max(1, e.years);
      if (starts && e.type !== 'retire') labels.push(e.label);
      switch (e.type) {
        case 'retire':
          if (e === retireEvent && age === retireAge) labels.push(e.label);
          break;
        case 'home':
          if (starts) {
            const price = e.amount * inflate;
            const down = Math.min(e.downPayment, e.amount) * inflate;
            eventOut += down;
            property.push({ value: price, rate: plan.growth.realEstate });
            if (price - down > 0.5) mortgages.push({ balance: price - down, rate: e.mortgageRate, payment: mortgagePayment(price - down, e.mortgageRate, e.years) });
          }
          break;
        case 'child':
        case 'college':
        case 'expense':
          if (within) eventOut += e.amount * inflate;
          break;
        case 'income':
          if (within) eventIn += e.amount * inflate;
          break;
        case 'windfall':
          if (starts) eventIn += e.amount * inflate;
          break;
        case 'socialSecurity':
          if (age >= e.age) eventIn += e.amount * 12 * inflate;
          break;
        case 'careerBreak':
          if (within) onBreak = true;
          break;
      }
    }

    const yearIncome = working && !onBreak ? income : 0;
    const yearSpending = spending;

    const surplus = yearIncome - yearSpending;
    // What gets added to (or taken from) savings this year
    const net = (surplus >= 0 ? surplus * (plan.savedShare / 100) : surplus) + eventIn - eventOut;
    if (net >= 0) {
      cash += net * cashShare;
      investments += net * (1 - cashShare);
    } else {
      // Draw the shortfall from cash first, then investments
      let need = -net;
      const fromCash = Math.min(cash, need);
      cash -= fromCash;
      need -= fromCash;
      const fromInvestments = Math.min(investments, need);
      investments -= fromInvestments;
      need -= fromInvestments;
      if (need > 0.5 && runsOutAt == null) runsOutAt = age;
    }

    points.push(point(age, yearIncome + eventIn, yearSpending + eventOut, labels));

    // Next year's amounts (a raise still happens during a career break)
    if (working) income *= 1 + rate(plan.incomeGrowth);
    spending *= 1 + rate(inflationPct);
    priceLevel *= 1 + rate(inflationPct);
  }

  return {
    currentAge,
    retireAge,
    points,
    runsOutAt,
    atRetirement: points.find(p => p.age === retireAge) ?? null,
    atEnd: points[points.length - 1],
  };
}

// Converts a future amount to today's dollars
export function inTodaysDollars(value: number, yearsFromNow: number, inflationPct: number) {
  return value / Math.pow(1 + inflationPct / 100, yearsFromNow);
}
