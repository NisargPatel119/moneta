// Monte Carlo simulation for the forecast: the same projection as forecast.ts, run many times with
// investment returns and inflation drawn at random. Pure functions, so they're easy to test
// (see forecastSim.test.ts). A fixed seed makes results identical between renders.
import { projectNetWorth, type ForecastPlan, type ReturnPath, type StartingPoint } from './forecast.ts';

export const SIM_RUNS = 1000;
export const SIM_SEED = 20261108;
/** Inflation wobbles by about this many percentage points from year to year */
export const INFLATION_SD = 1;

// Small, fast seeded generator (mulberry32): the same seed always gives the same sequence
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A draw from a normal distribution (Box–Muller)
export function normal(random: () => number, mean: number, sd: number) {
  const u = Math.max(random(), 1e-12);
  const v = random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Random returns and inflation for one run, `years` long (percent) */
export function randomPath(plan: ForecastPlan, years: number, random: () => number): ReturnPath {
  const returns: number[] = [];
  const inflation: number[] = [];
  for (let i = 0; i < years; i++) {
    // A market can't lose more than everything
    returns.push(Math.max(-90, normal(random, plan.growth.investments, plan.volatility)));
    inflation.push(Math.max(-2, normal(random, plan.inflation, INFLATION_SD)));
  }
  return { returns, inflation };
}

export type SimRun = {
  /** Net worth at each age from today to the plan-to age (future dollars) */
  netWorth: number[];
  /** First age money couldn't cover spending, or null */
  runsOutAt: number | null;
};

// Runs number `from` up to (not including) `to`. Each run has its own seed, so splitting the work into
// chunks (to keep the page responsive) gives exactly the same results as doing it in one go.
export function simulateRuns(
  plan: ForecastPlan,
  start: StartingPoint,
  baseline: { income: number; spending: number },
  from: number,
  to: number,
  today = new Date(),
  seed = SIM_SEED,
): SimRun[] {
  const years = plan.planToAge - (today.getFullYear() - (plan.birthYear ?? today.getFullYear() - 40));
  const runs: SimRun[] = [];
  for (let i = from; i < to; i++) {
    const random = seededRandom(seed + i * 7919);
    const r = projectNetWorth(plan, start, baseline, today, randomPath(plan, Math.max(0, years), random));
    runs.push({ netWorth: r.points.map(p => p.netWorth), runsOutAt: r.runsOutAt });
  }
  return runs;
}

export type SimBandPoint = { age: number; p10: number; p50: number; p90: number };

export type SimSummary = {
  runs: number;
  /** Share of runs where money lasts to the plan-to age, 0–1 */
  successRate: number;
  /** Median age money runs out among the runs that run short, or null if none do */
  medianRunsOutAt: number | null;
  /** Percentile bands by age (future dollars) */
  bands: SimBandPoint[];
};

// Value at a percentile (0–1) of an ascending list, interpolating between neighbors
export function percentile(sorted: number[], q: number) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function summarizeRuns(runs: SimRun[], startAge: number): SimSummary {
  const steps = runs[0]?.netWorth.length ?? 0;
  const bands: SimBandPoint[] = [];
  for (let i = 0; i < steps; i++) {
    const values = runs.map(r => r.netWorth[i]).sort((a, b) => a - b);
    bands.push({ age: startAge + i, p10: percentile(values, 0.1), p50: percentile(values, 0.5), p90: percentile(values, 0.9) });
  }
  const short = runs.map(r => r.runsOutAt).filter((a): a is number => a != null).sort((a, b) => a - b);
  return {
    runs: runs.length,
    successRate: runs.length ? (runs.length - short.length) / runs.length : 0,
    medianRunsOutAt: short.length ? short[Math.floor(short.length / 2)] : null,
    bands,
  };
}

// Everything in one call (tests, server-side summaries). The UI uses simulateRuns in chunks instead.
export function simulate(plan: ForecastPlan, start: StartingPoint, baseline: { income: number; spending: number }, today = new Date(), runs = SIM_RUNS): SimSummary {
  const startAge = today.getFullYear() - (plan.birthYear ?? today.getFullYear() - 40);
  return summarizeRuns(simulateRuns(plan, start, baseline, 0, runs, today), startAge);
}

export type SuccessBand = { id: 'onTrack' | 'worthALook' | 'atRisk'; label: string; blurb: string };

// Plain-language reading of a success rate (0–1)
export function successBand(rate: number): SuccessBand {
  if (rate >= 0.8) return { id: 'onTrack', label: 'On track', blurb: 'Money lasts in most of the simulated markets.' };
  if (rate >= 0.6) return { id: 'worthALook', label: 'Worth a look', blurb: 'Money lasts in many, but not all, simulated markets.' };
  return { id: 'atRisk', label: 'At risk', blurb: 'Money runs short in many simulated markets.' };
}
