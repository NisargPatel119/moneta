'use client';
import { useMemo, useState } from 'react';
import { Pencil, Telescope, TriangleAlert } from 'lucide-react';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { type DashboardData, formatCompact, formatMoney } from '@/lib/finance';
import type { TxnRules } from '@/lib/transfers';
import { DEFAULT_PLAN, currentAgeOf, inTodaysDollars, sanitizePlan, type ForecastPlan, type ForecastPoint } from '@/lib/forecast';
import { forecastFor } from '@/lib/forecastInputs';
import { Card, Money, SectionTitle, Sheet, cn, usePref, usePrivacy } from './ui';

const LINE = 'var(--accent)';

export function Forecast({ data, rules, onSavePlan }: {
  data: DashboardData;
  rules: TxnRules;
  onSavePlan: (plan: ForecastPlan) => void;
}) {
  const plan = data.settings?.forecastPlan ?? DEFAULT_PLAN;
  const [editing, setEditing] = useState(false);
  const [dollars, setDollars] = usePref('ws_forecast_dollars');
  const todays = dollars !== 'future';
  const { hidden } = usePrivacy();

  const result = useMemo(() => forecastFor(data, rules, plan), [data, rules, plan]);

  if (plan.birthYear == null) {
    return <ForecastSetup plan={plan} onSave={onSavePlan} />;
  }

  // Show amounts in today's dollars unless the user asked for future dollars
  const adjust = (value: number, age: number) =>
    todays ? inTodaysDollars(value, age - result.currentAge, plan.inflation) : value;
  const chartData = result.points.map(p => ({ ...p, value: adjust(p.netWorth, p.age) }));
  const atRetire = result.atRetirement;
  const surplus = (plan.income ?? result.baseline.income) - (plan.spending ?? result.baseline.spending);
  const income = plan.income ?? result.baseline.income;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 sm:p-5">
          <p className="eyebrow text-muted">At {plan.retireAge}</p>
          {atRetire ? (
            <Money value={adjust(atRetire.netWorth, atRetire.age)} whole className="block font-display text-4xl tracking-tight leading-none mt-2" />
          ) : (
            <p className="text-sm text-muted mt-2">You&apos;re past your retirement age in this plan.</p>
          )}
          <p className="text-[11px] text-faint mt-1.5">Projected net worth when you retire</p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="eyebrow text-muted">Money lasts</p>
          <p className={cn('font-display text-4xl tracking-tight leading-none mt-2', result.runsOutAt ? 'text-warn' : 'text-positive')}>
            {result.runsOutAt ? `Until ${result.runsOutAt}` : `Past ${plan.planToAge}`}
          </p>
          <p className="text-[11px] text-faint mt-1.5">
            {result.runsOutAt ? 'Cash and investments run short at this age' : `Cash and investments cover spending to age ${plan.planToAge}`}
          </p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="eyebrow text-muted">{surplus < 0 ? 'Short by' : 'Saving now'}</p>
          <Money value={surplus < 0 ? -surplus : surplus * (plan.savedShare / 100)} whole className={cn('block font-display text-4xl tracking-tight leading-none mt-2', surplus < 0 && 'text-warn')} />
          <p className="text-[11px] text-faint mt-1.5">
            {surplus < 0
              ? 'per year: spending is more than income'
              : <>per year{income > 0 && surplus > 0 && <> · {Math.round(((surplus * plan.savedShare) / 100 / income) * 100)}% of income</>}</>}
          </p>
        </Card>
      </div>

      <Card className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SectionTitle>Projected net worth</SectionTitle>
          <div className="inline-flex bg-sunken rounded-lg p-0.5 text-xs font-semibold -mt-3">
            {([['today', "Today's $"], ['future', 'Future $']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setDollars(id)} className={cn('px-2.5 py-1 rounded-md', (id === 'future') !== todays ? 'bg-surface text-ink' : 'text-muted')}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className={cn('h-60 sm:h-72 -mx-1', hidden && 'blur-md')}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fc-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={LINE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="age" tick={{ fontSize: 11, fill: 'var(--faint)' }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fill: 'var(--faint)' }} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<PointTooltip adjust={adjust} />} />
              <ReferenceLine x={plan.retireAge} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: 'Retire', position: 'insideTopRight', fill: 'var(--muted)', fontSize: 11 }} />
              {result.runsOutAt && (
                <ReferenceLine x={result.runsOutAt} stroke="var(--warn)" strokeDasharray="4 4" label={{ value: 'Runs short', position: 'insideTopLeft', fill: 'var(--warn)', fontSize: 11 }} />
              )}
              <Area type="monotone" dataKey="value" stroke={LINE} strokeWidth={2} fill="url(#fc-fill)" activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-faint mt-2">
          Age on the bottom. {todays ? "Amounts are in today's dollars, so they're comparable to what money buys now." : 'Amounts include inflation.'}
        </p>
      </Card>

      {result.runsOutAt && (
        <div className="flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn-soft p-4 text-sm text-warn">
          <TriangleAlert size={18} className="shrink-0 mt-0.5" />
          <p>
            In this plan, cash and investments run short at age {result.runsOutAt}. Try a later retirement age, a higher savings share,
            or different spending in <button onClick={() => setEditing(true)} className="font-semibold underline">your plan</button> to see how it changes.
          </p>
        </div>
      )}

      <Card className="p-5 sm:p-6">
        <SectionTitle action={
          <button onClick={() => setEditing(true)} className="text-sm font-semibold text-accent flex items-center gap-1 normal-case tracking-normal">
            <Pencil size={14} /> Edit
          </button>
        }>Your plan</SectionTitle>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <Fact label="Age" value={`${result.currentAge}`} />
          <Fact label="Retire at" value={`${plan.retireAge}`} />
          <Fact label="Plan to age" value={`${plan.planToAge}`} />
          <Fact label="Take-home income" value={<><Money value={income} whole />/yr</>} hint={plan.income == null ? 'from your last 12 months' : 'set by you'} />
          <Fact label="Spending" value={<><Money value={plan.spending ?? result.baseline.spending} whole />/yr</>} hint={plan.spending == null ? 'from your last 12 months' : 'set by you'} />
          <Fact label="Saved of any surplus" value={`${plan.savedShare}%`} />
          <Fact label="Investments grow" value={`${plan.growth.investments}%/yr`} />
          <Fact label="Cash grows" value={`${plan.growth.cash}%/yr`} />
          <Fact label="Inflation" value={`${plan.inflation}%/yr`} />
        </dl>
        <p className="text-xs text-faint mt-4 leading-relaxed">
          A simple, directional projection: steady growth each year, income stops at retirement, and spending comes out of cash, then
          investments. It doesn&apos;t model taxes, Social Security, or market ups and downs yet. It&apos;s not financial advice.
        </p>
      </Card>

      <Milestones points={result.points} adjust={adjust} plan={plan} />

      {editing && (
        <PlanEditor
          plan={plan}
          baseline={result.baseline}
          onClose={() => setEditing(false)}
          onSave={p => { onSavePlan(p); setEditing(false); }}
        />
      )}
    </div>
  );
}

// Overview teaser: one line, links to the tab
export function ForecastCard({ data, rules, onOpen }: { data: DashboardData; rules: TxnRules; onOpen: () => void }) {
  const plan = data.settings?.forecastPlan ?? DEFAULT_PLAN;
  const result = useMemo(() => (plan.birthYear == null ? null : forecastFor(data, rules, plan)), [data, rules, plan]);
  return (
    <button onClick={onOpen} className="w-full text-left">
      <Card className="p-6 hover:bg-sunken/50 transition-colors">
        <SectionTitle>Forecast</SectionTitle>
        <div className="flex items-start gap-3">
          <Telescope size={20} className="text-accent shrink-0 mt-0.5" />
          {result?.atRetirement ? (
            <p className="text-ink-2 leading-relaxed">
              At {plan.retireAge} you&apos;d have about{' '}
              <Money value={inTodaysDollars(result.atRetirement.netWorth, result.atRetirement.age - result.currentAge, plan.inflation)} whole className="font-semibold text-ink" />{' '}
              in today&apos;s dollars, and your money {result.runsOutAt ? <span className="text-warn font-semibold">runs short at {result.runsOutAt}</span> : <>lasts past {plan.planToAge}</>}.
            </p>
          ) : (
            <p className="text-ink-2">See where your net worth is heading. Add your age to get started.</p>
          )}
        </div>
      </Card>
    </button>
  );
}

function ForecastSetup({ plan, onSave }: { plan: ForecastPlan; onSave: (p: ForecastPlan) => void }) {
  const [age, setAge] = useState('');
  const [retire, setRetire] = useState(String(plan.retireAge));
  const ageNum = Number(age);
  const valid = Number.isInteger(ageNum) && ageNum >= 14 && ageNum <= 100 && Number(retire) > 0;
  return (
    <Card className="p-8 sm:p-10 max-w-lg">
      <div className="w-14 h-14 bg-accent-soft rounded-full flex items-center justify-center text-accent"><Telescope size={26} /></div>
      <h3 className="font-display text-3xl tracking-tight mt-5">See where you&apos;re heading</h3>
      <p className="text-muted mt-2 leading-relaxed">
        Moneta projects your net worth year by year using your balances and the last 12 months of income and spending.
        It just needs your age.
      </p>
      <div className="grid grid-cols-2 gap-3 mt-6">
        <NumberField label="Your age" value={age} onChange={setAge} placeholder="35" />
        <NumberField label="Retire at" value={retire} onChange={setRetire} />
      </div>
      <button
        disabled={!valid}
        onClick={() => onSave(sanitizePlan({ ...plan, birthYear: new Date().getFullYear() - ageNum, retireAge: Number(retire) }))}
        className="mt-6 w-full bg-accent text-on-accent py-3 rounded-xl font-semibold hover:bg-accent-strong disabled:opacity-40"
      >
        Show my forecast
      </button>
    </Card>
  );
}

function PlanEditor({ plan, baseline, onClose, onSave }: {
  plan: ForecastPlan;
  baseline: { income: number; spending: number; months: number };
  onClose: () => void;
  onSave: (p: ForecastPlan) => void;
}) {
  const s = (v: number | null) => (v == null ? '' : String(v));
  const [f, setF] = useState({
    age: s(plan.birthYear == null ? null : currentAgeOf(plan.birthYear)),
    retireAge: s(plan.retireAge),
    planToAge: s(plan.planToAge),
    income: s(plan.income),
    spending: s(plan.spending),
    savedShare: s(plan.savedShare),
    incomeGrowth: s(plan.incomeGrowth),
    inflation: s(plan.inflation),
    investments: s(plan.growth.investments),
    cash: s(plan.growth.cash),
    realEstate: s(plan.growth.realEstate),
    vehicles: s(plan.growth.vehicles),
    other: s(plan.growth.other),
  });
  const set = (key: keyof typeof f) => (v: string) => setF(prev => ({ ...prev, [key]: v }));
  const clean = (v: string) => v.replace(/[$,%\s]/g, '');

  const save = () => onSave(sanitizePlan({
    birthYear: f.age ? new Date().getFullYear() - Number(clean(f.age)) : plan.birthYear,
    retireAge: clean(f.retireAge),
    planToAge: clean(f.planToAge),
    income: clean(f.income),
    spending: clean(f.spending),
    savedShare: clean(f.savedShare),
    incomeGrowth: clean(f.incomeGrowth),
    inflation: clean(f.inflation),
    growth: {
      investments: clean(f.investments), cash: clean(f.cash), realEstate: clean(f.realEstate),
      vehicles: clean(f.vehicles), other: clean(f.other),
    },
  }));

  const fromHistory = baseline.months > 0 ? `${baseline.months} month${baseline.months === 1 ? '' : 's'} of history` : 'no history yet';
  return (
    <Sheet
      open
      onClose={onClose}
      title="Your plan"
      subtitle="Change anything to see how your forecast moves."
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => onSave({ ...DEFAULT_PLAN, birthYear: plan.birthYear })}
            className="text-sm font-semibold text-muted hover:text-ink"
          >
            Reset assumptions
          </button>
          <button onClick={save} className="bg-accent text-on-accent px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-accent-strong">Save</button>
        </div>
      }
    >
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <NumberField label="Your age" value={f.age} onChange={set('age')} />
          <NumberField label="Retire at" value={f.retireAge} onChange={set('retireAge')} />
          <NumberField label="Plan to age" value={f.planToAge} onChange={set('planToAge')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Take-home income / yr" prefix="$" value={f.income} onChange={set('income')} placeholder={String(baseline.income)}
            hint={`Blank = ${formatMoney(baseline.income, { whole: true })} from ${fromHistory}`} />
          <NumberField label="Spending / yr" prefix="$" value={f.spending} onChange={set('spending')} placeholder={String(baseline.spending)}
            hint={`Blank = ${formatMoney(baseline.spending, { whole: true })} from ${fromHistory}`} />
          <NumberField label="Saved of any surplus" suffix="%" value={f.savedShare} onChange={set('savedShare')} hint="How much of what's left over you actually keep" />
          <NumberField label="Yearly raise" suffix="%" value={f.incomeGrowth} onChange={set('incomeGrowth')} />
        </div>
        <div>
          <p className="eyebrow text-muted mb-2">Growth per year</p>
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="Investments" suffix="%" value={f.investments} onChange={set('investments')} />
            <NumberField label="Cash" suffix="%" value={f.cash} onChange={set('cash')} />
            <NumberField label="Inflation" suffix="%" value={f.inflation} onChange={set('inflation')} />
            <NumberField label="Real estate" suffix="%" value={f.realEstate} onChange={set('realEstate')} />
            <NumberField label="Vehicles" suffix="%" value={f.vehicles} onChange={set('vehicles')} />
            <NumberField label="Other assets" suffix="%" value={f.other} onChange={set('other')} />
          </div>
          <p className="text-[11px] text-faint mt-2">Assets you added by hand with their own yearly change keep that rate.</p>
        </div>
      </div>
    </Sheet>
  );
}

function NumberField({ label, value, onChange, prefix, suffix, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  prefix?: string; suffix?: string; placeholder?: string; hint?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className="relative block mt-1">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">{prefix}</span>}
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          inputMode="decimal"
          placeholder={placeholder}
          className={cn(
            'w-full bg-sunken border border-line rounded-xl py-2.5 text-[16px] sm:text-sm tabular-nums outline-none focus:ring-2 focus:ring-accent focus:bg-surface',
            prefix ? 'pl-6' : 'pl-3', suffix ? 'pr-7' : 'pr-3',
          )}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">{suffix}</span>}
      </span>
      {hint && <span className="text-[11px] text-faint mt-1 block">{hint}</span>}
    </label>
  );
}

function Fact({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
      {hint && <dd className="text-[11px] text-faint">{hint}</dd>}
    </div>
  );
}

// Net worth and its parts at a few ages: now, retirement, and the end of the plan
function Milestones({ points, adjust, plan }: { points: ForecastPoint[]; adjust: (v: number, age: number) => number; plan: ForecastPlan }) {
  const now = points[0];
  const picks = [
    { label: 'Today', point: now },
    ...[now.age + 10, plan.retireAge, plan.planToAge]
      .filter((age, i, arr) => age > now.age && arr.indexOf(age) === i)
      .sort((a, b) => a - b)
      .map(age => ({ label: age === plan.retireAge ? `At ${age} (retire)` : `At ${age}`, point: points.find(p => p.age === age) })),
  ].filter((m): m is { label: string; point: ForecastPoint } => !!m.point);

  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5"><SectionTitle>Milestones</SectionTitle></div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="font-semibold px-5 py-2"></th>
              {picks.map(m => <th key={m.label} className="font-semibold px-3 py-2 text-right whitespace-nowrap">{m.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {([['Investments', 'investments'], ['Cash', 'cash'], ['Property', 'property'], ['Debts', 'debts'], ['Net worth', 'netWorth']] as const).map(([label, key]) => (
              <tr key={key} className={cn(key === 'netWorth' && 'font-semibold text-ink')}>
                <td className="px-5 py-2 text-ink-2">{label}</td>
                {picks.map(m => (
                  <td key={m.label} className="px-3 py-2 text-right">
                    <Money value={(key === 'debts' ? -1 : 1) * adjust(m.point[key], m.point.age)} whole />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PointTooltip({ active, payload, adjust }: {
  active?: boolean;
  payload?: { payload: ForecastPoint & { value: number } }[];
  adjust: (v: number, age: number) => number;
}) {
  const { hidden } = usePrivacy();
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  // The chart is blurred when amounts are hidden; the tooltip shouldn't give them away
  const fmt = (v: number) => (hidden ? '•••' : formatMoney(v, { whole: true }));
  const row = (label: string, value: number) => (
    <div className="flex justify-between gap-6"><span className="text-muted">{label}</span><span className="tabular-nums">{fmt(adjust(value, p.age))}</span></div>
  );
  return (
    <div className="rounded-xl border border-line bg-surface text-ink shadow-lg p-3 text-xs space-y-0.5">
      <p className="font-semibold text-sm mb-1">Age {p.age} · {p.year}</p>
      <div className="flex justify-between gap-6 font-semibold"><span>Net worth</span><span className="tabular-nums">{fmt(p.value)}</span></div>
      {row('Investments', p.investments)}
      {row('Cash', p.cash)}
      {p.property > 0 && row('Property', p.property)}
      {p.debts > 0 && row('Debts', -p.debts)}
    </div>
  );
}
