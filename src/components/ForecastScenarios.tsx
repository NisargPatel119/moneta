'use client';
import { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { type DashboardData, formatCompact, formatMoney } from '@/lib/finance';
import { EVENT_META, MAX_EVENTS, inTodaysDollars, newEvent, projectNetWorth, sanitizePlan, type EventType, type ForecastPlan, type LifeEvent } from '@/lib/forecast';
import { startingPoint } from '@/lib/forecastInputs';
import { SIM_RUNS, simulateRuns, successBand, summarizeRuns, type SimRun, type SimSummary } from '@/lib/forecastSim';
import {
  MAX_COMPARE, MAX_SCENARIOS, describeChanges, effectiveRetireAge, mergeSeries, monthlySavings, newScenarioId,
  withMonthlySavings, withRetireAge, type Baseline, type ForecastScenario,
} from '@/lib/forecastScenarios';
import { EventEditor, NumberField } from './Forecast';
import { Card, Money, SectionTitle, Sheet, cn, usePrivacy } from './ui';

// Line colors for up to three series. Each also has its own dash pattern, so they never rely on color alone.
const SERIES = [
  { color: 'var(--accent)', dash: undefined },
  { color: 'var(--series-2)', dash: '7 4' },
  { color: 'var(--series-1)', dash: '2 3' },
] as const;

type Job = { id: string; plan: ForecastPlan };

// Runs the simulations for several plans in small chunks so the page stays responsive. Finished results are
// kept (a handful), so switching a scenario on and off doesn't start over. null while a plan is still running.
function useSimulations(data: DashboardData, baseline: Baseline, currentAge: number, jobs: Job[]) {
  const [cache, setCache] = useState<Record<string, SimSummary>>({});
  const prepared = useMemo(() => jobs.map(j => {
    const start = startingPoint(data, j.plan);
    return { ...j, start, key: JSON.stringify([j.plan, start, baseline]) };
  }), [data, baseline, jobs]);

  useEffect(() => {
    const todo = prepared.filter(p => !cache[p.key]);
    if (todo.length === 0) return;
    const job = todo[0];
    let cancelled = false;
    const runs: SimRun[] = [];
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      if (cancelled) return;
      runs.push(...simulateRuns(job.plan, job.start, baseline, runs.length, Math.min(SIM_RUNS, runs.length + 100)));
      if (runs.length < SIM_RUNS) { timer = setTimeout(step, 0); return; }
      const summary = summarizeRuns(runs, currentAge);
      setCache(c => {
        const next = { ...c, [job.key]: summary };
        const keys = Object.keys(next);
        for (const k of keys.slice(0, Math.max(0, keys.length - 12))) delete next[k];
        return next;
      });
    };
    timer = setTimeout(step, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [prepared, cache, baseline, currentAge]);

  return prepared.map(p => cache[p.key] ?? null);
}

type Series = {
  id: string;
  name: string;
  plan: ForecastPlan;
  retireAge: number;
  runsOutAt: number | null;
  atRetirement: number | null;
  points: { age: number; value: number }[];
};

// The steady projection for a plan, in today's or future dollars
function lineFor(id: string, name: string, plan: ForecastPlan, data: DashboardData, baseline: Baseline, todays: boolean): Series {
  const r = projectNetWorth(plan, startingPoint(data, plan), baseline);
  const adjust = (v: number, age: number) => (todays ? inTodaysDollars(v, age - r.currentAge, plan.inflation) : v);
  return {
    id, name, plan,
    retireAge: r.retireAge,
    runsOutAt: r.runsOutAt,
    atRetirement: r.atRetirement ? adjust(r.atRetirement.netWorth, r.atRetirement.age) : null,
    points: r.points.map(p => ({ age: p.age, value: adjust(p.netWorth, p.age) })),
  };
}

export function ScenariosPanel({ data, plan, baseline, currentAge, scenarios, todays, onSave }: {
  data: DashboardData;
  plan: ForecastPlan;
  baseline: Baseline;
  currentAge: number;
  scenarios: ForecastScenario[];
  todays: boolean;
  onSave: (scenarios: ForecastScenario[]) => void;
}) {
  // A scenario is a copy, so it keeps the age from when it was saved; use today's age for all of them
  const fixed = useMemo(
    () => scenarios.map(s => ({ ...s, plan: { ...s.plan, birthYear: plan.birthYear } })),
    [scenarios, plan.birthYear],
  );
  // Which lines the compare chart shows: the current plan and the first two scenarios to begin with
  const [picked, setPicked] = useState<string[]>(() => ['plan', ...scenarios.slice(0, MAX_COMPARE - 1).map(s => s.id)]);
  const [editing, setEditing] = useState<ForecastScenario | null>(null);
  const [toast, setToast] = useState('');

  const shown = useMemo(() => picked.filter(id => id === 'plan' || fixed.some(s => s.id === id)), [picked, fixed]);
  const jobs = useMemo<Job[]>(
    () => [{ id: 'plan', plan }, ...fixed.map(s => ({ id: s.id, plan: s.plan }))].filter(j => shown.includes(j.id)),
    [plan, fixed, shown],
  );
  const sims = useSimulations(data, baseline, currentAge, jobs);
  const lines = useMemo(
    () => jobs.map(j => lineFor(j.id, j.id === 'plan' ? 'Current plan' : fixed.find(s => s.id === j.id)?.name ?? '', j.plan, data, baseline, todays)),
    [jobs, fixed, data, baseline, todays],
  );

  const toggle = (id: string) => setPicked(p => {
    const cur = p.filter(x => x === 'plan' || fixed.some(s => s.id === x));
    if (cur.includes(id)) return cur.length > 1 ? cur.filter(x => x !== id) : cur;
    return cur.length >= MAX_COMPARE ? cur : [...cur, id];
  });

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };
  const saveAll = (next: ForecastScenario[]) => onSave(next);
  const addScenario = (name: string, p: ForecastPlan) => {
    const s: ForecastScenario = { id: newScenarioId(scenarios), name: name.trim().slice(0, 40) || `Scenario ${scenarios.length + 1}`, plan: p };
    saveAll([...scenarios, s]);
    setPicked(cur => (cur.length < MAX_COMPARE ? [...cur, s.id] : cur));
    flash(`Saved "${s.name}"`);
  };

  return (
    <>
      <WhatIf data={data} plan={plan} baseline={baseline} currentAge={currentAge} todays={todays}
        canSave={scenarios.length < MAX_SCENARIOS} onSaveAs={addScenario} />

      <Card className="p-5 sm:p-6">
        <SectionTitle action={
          scenarios.length < MAX_SCENARIOS ? (
            <button onClick={() => setEditing({ id: '', name: '', plan })} className="text-sm font-semibold text-accent flex items-center gap-1 normal-case tracking-normal">
              <Plus size={14} /> New
            </button>
          ) : undefined
        }>Scenarios</SectionTitle>
        <p className="text-sm text-muted leading-relaxed mb-3">
          Save a copy of your plan with changes, like retiring earlier or buying a home, then compare up to {MAX_COMPARE} side by side.
        </p>
        <ul className="divide-y divide-line -mx-1">
          <ScenarioRow id="plan" name="Current plan" note="What you see above" picked={shown.includes('plan')} index={shown.indexOf('plan')} full={shown.length >= MAX_COMPARE} onToggle={toggle} />
          {fixed.map(s => (
            <ScenarioRow
              key={s.id} id={s.id} name={s.name}
              note={describeChanges(plan, s.plan, baseline).join(' · ') || 'Same as your plan'}
              picked={shown.includes(s.id)} index={shown.indexOf(s.id)} full={shown.length >= MAX_COMPARE}
              onToggle={toggle} onEdit={() => setEditing(scenarios.find(x => x.id === s.id) ?? null)}
            />
          ))}
        </ul>
        {scenarios.length === 0 && <p className="text-sm text-muted mt-3">No scenarios yet. Tap New, or try the sliders above and save what you like.</p>}
        {toast && <p role="status" className="text-xs font-semibold text-accent mt-3 flex items-center gap-1"><Check size={14} /> {toast}</p>}
      </Card>

      {lines.length > 0 && (
        <Card className="p-5 sm:p-6">
          <SectionTitle>Compare</SectionTitle>
          <CompareChart lines={lines} todays={todays} />
          <div className="mt-4 space-y-3">
            {lines.map((l, i) => {
              const sim = sims[i];
              const pct = sim ? Math.round(sim.successRate * 100) : null;
              const band = sim ? successBand(sim.successRate) : null;
              return (
                <div key={l.id} className="rounded-xl bg-sunken/60 p-3">
                  <p className="flex items-center gap-2 font-semibold text-ink min-w-0">
                    <Swatch index={i} /> <span className="truncate">{l.name}</span>
                  </p>
                  <dl className="grid grid-cols-3 gap-2 mt-2 text-sm">
                    <Stat label="Chance it lasts" value={pct == null ? 'Running…' : `${pct}%`} sub={band?.label} warn={band != null && band.id !== 'onTrack'} />
                    <Stat label="Money lasts" value={l.runsOutAt ? `Until ${l.runsOutAt}` : `Past ${l.plan.planToAge}`} warn={l.runsOutAt != null} />
                    <Stat label={`At ${l.retireAge}`} value={l.atRetirement == null ? '–' : <Money value={l.atRetirement} whole />} sub="net worth" />
                  </dl>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-faint mt-3 leading-relaxed">
            Lines are the steady projection. &quot;Chance it lasts&quot; comes from {SIM_RUNS.toLocaleString('en-US')} simulated markets per line, with the same seed,
            so differences come from your changes, not luck. {todays ? "Amounts are in today's dollars." : 'Amounts include inflation.'}
          </p>
        </Card>
      )}

      {editing && (
        <ScenarioEditor
          scenario={editing}
          basePlan={plan}
          baseline={baseline}
          currentAge={currentAge}
          onClose={() => setEditing(null)}
          onSave={s => {
            if (s.id) saveAll(scenarios.map(x => (x.id === s.id ? s : x)));
            else addScenario(s.name, s.plan);
            setEditing(null);
          }}
          onDelete={editing.id ? () => { saveAll(scenarios.filter(x => x.id !== editing.id)); setEditing(null); } : undefined}
        />
      )}
    </>
  );
}

function Swatch({ index }: { index: number }) {
  const s = SERIES[Math.max(0, index) % SERIES.length];
  return (
    <svg width="22" height="8" aria-hidden="true" className="shrink-0">
      <line x1="1" y1="4" x2="21" y2="4" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} strokeLinecap="round" />
    </svg>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: React.ReactNode; sub?: string; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted leading-tight">{label}</dt>
      <dd className={cn('font-semibold tabular-nums', warn ? 'text-warn' : 'text-ink')}>{value}</dd>
      {sub && <dd className={cn('text-[11px]', warn ? 'text-warn' : 'text-faint')}>{sub}</dd>}
    </div>
  );
}

function ScenarioRow({ id, name, note, picked, index, full, onToggle, onEdit }: {
  id: string; name: string; note: string; picked: boolean; index: number; full: boolean;
  onToggle: (id: string) => void; onEdit?: () => void;
}) {
  const blocked = !picked && full;
  return (
    <li className="flex items-center gap-3 py-2.5 px-1">
      <label className={cn('flex items-center gap-3 flex-1 min-w-0', blocked ? 'opacity-50' : 'cursor-pointer')} title={blocked ? `Turn one off to compare another (up to ${MAX_COMPARE})` : undefined}>
        <input
          type="checkbox" checked={picked} disabled={blocked} onChange={() => onToggle(id)}
          aria-label={`Compare ${name}`} className="w-4 h-4 shrink-0 accent-[var(--accent)]"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-2 font-semibold text-ink min-w-0">
            {picked && <Swatch index={index} />}<span className="truncate">{name}</span>
          </span>
          <span className="block text-xs text-muted truncate">{note}</span>
        </span>
      </label>
      {onEdit && (
        <button onClick={onEdit} aria-label={`Edit ${name}`} className="p-2 -m-1 rounded-lg text-muted hover:bg-sunken hover:text-ink"><Pencil size={16} /></button>
      )}
    </li>
  );
}

function CompareChart({ lines, todays, height = 'h-56 sm:h-64' }: { lines: Series[]; todays: boolean; height?: string }) {
  const { hidden } = usePrivacy();
  const rows = useMemo(() => mergeSeries(lines.map(l => ({ id: l.id, points: l.points }))), [lines]);
  const names = Object.fromEntries(lines.map(l => [l.id, l.name]));
  return (
    <div className={cn(height, '-mx-1', hidden && 'blur-md')} role="img" aria-label={`Projected net worth for ${lines.map(l => l.name).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="age" tick={{ fontSize: 11, fill: 'var(--faint)' }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fill: 'var(--faint)' }} axisLine={false} tickLine={false} width={52} />
          <Tooltip content={<CompareTooltip names={names} order={lines.map(l => l.id)} todays={todays} />} />
          {lines.map(l => (
            <ReferenceLine key={`r-${l.id}`} x={l.retireAge} stroke="var(--line-strong)" strokeDasharray="2 4" />
          ))}
          {lines.map((l, i) => (
            <Line
              key={l.id} type="monotone" dataKey={l.id} stroke={SERIES[i % SERIES.length].color} strokeWidth={2.25}
              strokeDasharray={SERIES[i % SERIES.length].dash} dot={false} activeDot={{ r: 4 }} isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompareTooltip({ active, label, payload, names, order, todays }: {
  active?: boolean;
  label?: number;
  payload?: { dataKey?: string | number; value?: number }[];
  names: Record<string, string>;
  order: string[];
  todays: boolean;
}) {
  const { hidden } = usePrivacy();
  if (!active || !payload?.length) return null;
  // The chart is blurred when amounts are hidden; the tooltip shouldn't give them away
  const fmt = (v: number) => (hidden ? '•••' : formatMoney(v, { whole: true }));
  const value = (id: string) => payload.find(p => p.dataKey === id)?.value;
  return (
    <div className="rounded-xl border border-line bg-surface text-ink shadow-lg p-3 text-xs space-y-0.5 max-w-[240px]">
      <p className="font-semibold text-sm mb-1">Age {label}</p>
      {order.map((id, i) => {
        const v = value(id);
        return v == null ? null : (
          <div key={id} className="flex justify-between gap-4">
            <span className="flex items-center gap-1.5 min-w-0"><Swatch index={i} /><span className="truncate">{names[id]}</span></span>
            <span className="tabular-nums font-semibold">{fmt(v)}</span>
          </div>
        );
      })}
      <p className="text-faint pt-1">{todays ? "Today's dollars" : 'Future dollars'}</p>
    </div>
  );
}

// Two sliders that preview a change right away, without saving anything
function WhatIf({ data, plan, baseline, currentAge, todays, canSave, onSaveAs }: {
  data: DashboardData; plan: ForecastPlan; baseline: Baseline; currentAge: number; todays: boolean;
  canSave: boolean; onSaveAs: (name: string, plan: ForecastPlan) => void;
}) {
  const baseRetire = effectiveRetireAge(plan);
  const baseSave = Math.round(monthlySavings(plan, baseline) / 50) * 50;
  const [retire, setRetire] = useState<number | null>(null);
  const [save, setSave] = useState<number | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const retireNow = retire ?? baseRetire;
  const saveNow = save ?? baseSave;
  const changed = retireNow !== baseRetire || saveNow !== baseSave;
  const minAge = Math.max(30, currentAge + 1);
  const maxAge = Math.min(85, plan.planToAge - 1);
  const maxSave = Math.max(5000, Math.ceil((baseSave * 2) / 500) * 500);
  const minSave = Math.min(0, Math.floor(baseSave / 500) * 500);

  // What the sliders produce. Only changed values are applied, so untouched ones keep the plan as it is.
  const preview = useMemo(() => {
    let p = plan;
    if (retireNow !== baseRetire) p = withRetireAge(p, retireNow);
    if (saveNow !== baseSave) p = withMonthlySavings(p, baseline, saveNow);
    return p;
  }, [plan, baseline, retireNow, saveNow, baseRetire, baseSave]);
  // The sliders move fast; wait for them to settle before running a thousand simulations
  const [settled, setSettled] = useState(preview);
  useEffect(() => {
    const t = setTimeout(() => setSettled(preview), 200);
    return () => clearTimeout(t);
  }, [preview]);

  const jobs = useMemo<Job[]>(() => [{ id: 'plan', plan }, { id: 'whatif', plan: settled }], [plan, settled]);
  const [simPlan, simWhatIf] = useSimulations(data, baseline, currentAge, changed ? jobs : jobs.slice(0, 1));
  const lines = useMemo(() => [
    lineFor('plan', 'Current plan', plan, data, baseline, todays),
    ...(changed ? [lineFor('whatif', 'What if', preview, data, baseline, todays)] : []),
  ], [plan, preview, changed, data, baseline, todays]);

  const [a, b] = lines;
  const pct = (s: SimSummary | null | undefined) => (s ? `${Math.round(s.successRate * 100)}%` : '…');
  const reset = () => { setRetire(null); setSave(null); };

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle>What if</SectionTitle>
      <p className="text-sm text-muted leading-relaxed -mt-1 mb-4">Slide to preview a change. Nothing is saved unless you save it as a scenario.</p>
      <div className="space-y-4">
        <SliderRow
          label="Retire at" value={`${retireNow}`} min={minAge} max={Math.max(minAge, maxAge)} step={1}
          current={retireNow} onChange={setRetire} note={retireNow !== baseRetire ? `Plan: ${baseRetire}` : undefined}
        />
        <SliderRow
          label="Save per month" value={<Money value={saveNow} whole />} min={minSave} max={maxSave} step={50}
          current={saveNow} onChange={setSave} note={saveNow !== baseSave ? <>Plan: <Money value={baseSave} whole /></> : undefined}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-5 text-sm">
        <Stat label={`At ${b?.retireAge ?? a.retireAge}`} value={(b ?? a).atRetirement == null ? '–' : <Money value={(b ?? a).atRetirement!} whole />}
          sub={b && a.retireAge === b.retireAge && a.atRetirement != null && b.atRetirement != null ? delta(b.atRetirement - a.atRetirement) : 'net worth'} />
        <Stat label="Money lasts" value={(b ?? a).runsOutAt ? `Until ${(b ?? a).runsOutAt}` : `Past ${plan.planToAge}`} warn={(b ?? a).runsOutAt != null}
          sub={b && a.runsOutAt !== b.runsOutAt ? `Plan: ${a.runsOutAt ? `until ${a.runsOutAt}` : `past ${plan.planToAge}`}` : undefined} />
        <Stat label="Chance it lasts" value={pct(changed ? simWhatIf : simPlan)}
          sub={changed && simPlan ? `Plan: ${pct(simPlan)}` : undefined} />
      </div>

      {changed && <div className="mt-4"><CompareChart lines={lines} todays={todays} height="h-44" /></div>}

      {changed && (
        <div className="mt-4 pt-4 border-t border-line">
          {naming ? (
            <form
              className="flex items-center gap-2"
              onSubmit={e => { e.preventDefault(); onSaveAs(name || `Retire at ${retireNow}`, preview); setNaming(false); setName(''); reset(); }}
            >
              <input
                value={name} onChange={e => setName(e.target.value)} maxLength={40} autoFocus
                placeholder={`Retire at ${retireNow}`} aria-label="Scenario name"
                className="flex-1 min-w-0 bg-sunken border border-line rounded-xl px-3 py-2.5 text-[16px] sm:text-sm outline-none focus:ring-2 focus:ring-accent focus:bg-surface"
              />
              <button type="submit" className="bg-accent text-on-accent px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-accent-strong">Save</button>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <button onClick={reset} className="text-sm font-semibold text-muted hover:text-ink">Reset</button>
              {canSave
                ? <button onClick={() => setNaming(true)} className="text-sm font-semibold text-accent flex items-center gap-1"><Sparkles size={14} /> Save as scenario</button>
                : <span className="text-xs text-faint">Scenario limit reached ({MAX_SCENARIOS})</span>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function delta(diff: number) {
  if (Math.abs(diff) < 500) return 'about the same';
  return `${diff > 0 ? '+' : '−'}${formatCompact(Math.abs(diff))} vs. plan`;
}

function SliderRow({ label, value, min, max, step, current, onChange, note }: {
  label: string; value: React.ReactNode; min: number; max: number; step: number; current: number;
  onChange: (v: number) => void; note?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-muted">{label}</span>
        <span className="text-right"><span className="font-semibold text-ink tabular-nums">{value}</span>{note && <span className="text-[11px] text-faint ml-2">{note}</span>}</span>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, current))}
        onChange={e => onChange(Number(e.target.value))} aria-label={label}
        className="w-full mt-2 h-8 accent-[var(--accent)]"
      />
    </label>
  );
}

const ADDABLE: EventType[] = ['home', 'child', 'college', 'windfall', 'socialSecurity', 'careerBreak', 'income', 'expense'];

// Edits a copy of the plan: a few headline assumptions and which life events are on
function ScenarioEditor({ scenario, basePlan, baseline, currentAge, onClose, onSave, onDelete }: {
  scenario: ForecastScenario;
  basePlan: ForecastPlan;
  baseline: Baseline;
  currentAge: number;
  onClose: () => void;
  onSave: (s: ForecastScenario) => void;
  onDelete?: () => void;
}) {
  const start = scenario.plan;
  const startSave = Math.round(monthlySavings(start, baseline));
  const [f, setF] = useState({
    name: scenario.name,
    retireAge: String(effectiveRetireAge(start)),
    planToAge: String(start.planToAge),
    savings: String(startSave),
    investments: String(start.growth.investments),
    inflation: String(start.inflation),
  });
  const [events, setEvents] = useState<LifeEvent[]>(start.events);
  const [eventEdit, setEventEdit] = useState<LifeEvent | null>(null);
  const [picking, setPicking] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF(p => ({ ...p, [k]: v }));
  const clean = (v: string) => v.replace(/[$,%\s]/g, '');
  const num = (v: string) => Number(clean(v));
  const valid = Number.isFinite(num(f.retireAge)) && f.retireAge.trim() !== '' && Number.isFinite(num(f.savings)) && f.savings.trim() !== '';

  const save = () => {
    let p: ForecastPlan = sanitizePlan({
      ...start,
      events,
      planToAge: clean(f.planToAge),
      inflation: clean(f.inflation),
      growth: { ...start.growth, investments: clean(f.investments) },
    });
    p = withRetireAge(p, Math.round(num(f.retireAge)));
    // Only touch spending if the savings amount was changed
    if (Math.round(num(f.savings)) !== startSave) p = withMonthlySavings(p, baseline, num(f.savings));
    onSave({ ...scenario, name: f.name.trim().slice(0, 40) || 'Scenario', plan: p });
  };

  const sorted = [...events].sort((x, y) => x.age - y.age);
  return (
    <Sheet
      open onClose={onClose}
      title={scenario.id ? 'Edit scenario' : 'New scenario'}
      subtitle={scenario.id ? 'Change anything. Your main plan stays as it is.' : 'Starts as a copy of your current plan. Change what you like.'}
      footer={
        <div className="flex items-center justify-between gap-3">
          {onDelete ? <button onClick={onDelete} className="text-sm font-semibold text-muted hover:text-warn flex items-center gap-1"><Trash2 size={14} /> Delete</button> : <span />}
          <button disabled={!valid} onClick={save} className="bg-accent text-on-accent px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-accent-strong disabled:opacity-40">Save</button>
        </div>
      }
    >
      <div className="p-5 space-y-5">
        <label className="block">
          <span className="text-xs font-semibold text-muted">Name</span>
          <input
            value={f.name} onChange={e => set('name')(e.target.value)} maxLength={40} placeholder="Retire at 55"
            className="mt-1 w-full bg-sunken border border-line rounded-xl px-3 py-2.5 text-[16px] sm:text-sm outline-none focus:ring-2 focus:ring-accent focus:bg-surface"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Retire at" value={f.retireAge} onChange={set('retireAge')} />
          <NumberField label="Plan to age" value={f.planToAge} onChange={set('planToAge')} />
          <NumberField label="Saved per month" prefix="$" value={f.savings} onChange={set('savings')} hint={`Your plan: ${formatMoney(Math.round(monthlySavings(basePlan, baseline)), { whole: true })}`} />
          <NumberField label="Investments grow" suffix="%" value={f.investments} onChange={set('investments')} hint={`Your plan: ${basePlan.growth.investments}%`} />
          <NumberField label="Inflation" suffix="%" value={f.inflation} onChange={set('inflation')} hint={`Your plan: ${basePlan.inflation}%`} />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <p className="eyebrow text-muted">Life events</p>
            {events.length < MAX_EVENTS && (
              <button onClick={() => setPicking(p => !p)} className="text-sm font-semibold text-accent flex items-center gap-1"><Plus size={14} /> Add</button>
            )}
          </div>
          {picking && (
            <div className="flex flex-wrap gap-2 mt-2">
              {ADDABLE.map(type => (
                <button
                  key={type}
                  onClick={() => { setPicking(false); setEventEdit({ ...newEvent(type, currentAge, num(f.retireAge) || basePlan.retireAge), id: '' }); }}
                  className="px-3 py-1.5 rounded-full bg-sunken text-sm font-semibold text-ink-2 hover:bg-accent-soft hover:text-accent"
                >
                  {EVENT_META[type].label}
                </button>
              ))}
            </div>
          )}
          {sorted.length === 0 ? (
            <p className="text-sm text-muted mt-2">No life events in this scenario.</p>
          ) : (
            <ul className="divide-y divide-line mt-1">
              {sorted.map(e => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <button onClick={() => setEventEdit(e)} className={cn('flex-1 min-w-0 text-left', !e.enabled && 'opacity-50')}>
                    <p className="font-semibold text-ink truncate">{e.label}</p>
                    <p className="text-xs text-muted truncate">Age {e.age}{e.amount ? ` · ${formatMoney(e.amount, { whole: true })}` : ''}</p>
                  </button>
                  <button
                    role="switch" aria-checked={e.enabled} aria-label={`${e.enabled ? 'Turn off' : 'Turn on'} ${e.label}`}
                    onClick={() => setEvents(list => list.map(x => (x.id === e.id ? { ...x, enabled: !x.enabled } : x)))}
                    className={cn('relative w-10 h-6 rounded-full shrink-0 transition-colors', e.enabled ? 'bg-accent' : 'bg-line')}
                  >
                    <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-surface shadow transition-transform', e.enabled && 'translate-x-4')} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {eventEdit && (
        <EventEditor
          z="z-40"
          event={eventEdit}
          currentAge={currentAge}
          onClose={() => setEventEdit(null)}
          onSave={e => {
            const id = e.id || `e${Date.now().toString(36)}`;
            const saved = { ...e, id };
            setEvents(list => (list.some(x => x.id === id) ? list.map(x => (x.id === id ? saved : x)) : [...list, saved]));
            setEventEdit(null);
          }}
          onDelete={eventEdit.id ? () => { setEvents(list => list.filter(x => x.id !== eventEdit.id)); setEventEdit(null); } : undefined}
        />
      )}
    </Sheet>
  );
}
