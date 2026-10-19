'use client';
import { useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import {
  type DashboardData, type Txn, dayKey, formatMoney, friendlyDay, isIncome, merchantKey, parseDay,
} from '@/lib/finance';
import type { TxnRules } from '@/lib/transfers';
import { Money, SectionTitle, Sheet, cn, usePrivacy } from './ui';
import { TransactionList } from './TransactionList';

// What a drill-down shows: a list of transactions behind a number, or everything from one merchant
export type Drill =
  | { kind: 'txns'; title: string; subtitle?: string; txns: Txn[]; total?: 'spending' | 'income' | 'flow' }
  | { kind: 'merchant'; key: string; name: string };

export function DrillSheet({ drill, data, rules, accountName, onClose, onSelect }: {
  drill: Drill | null;
  data: DashboardData;
  rules: TxnRules;
  accountName: (id: string) => string | undefined;
  onClose: () => void;
  onSelect: (t: Txn) => void;
}) {
  if (!drill) return null;
  return drill.kind === 'merchant'
    ? <MerchantSheet merchant={drill} data={data} rules={rules} accountName={accountName} onClose={onClose} onSelect={onSelect} />
    : <TxnsSheet drill={drill} rules={rules} accountName={accountName} onClose={onClose} onSelect={onSelect} />;
}

function TxnsSheet({ drill, rules, accountName, onClose, onSelect }: {
  drill: Extract<Drill, { kind: 'txns' }>;
  rules: TxnRules;
  accountName: (id: string) => string | undefined;
  onClose: () => void;
  onSelect: (t: Txn) => void;
}) {
  const total = drill.total === 'spending'
    ? drill.txns.reduce((s, t) => (rules.isSpending(t) ? s + t.amount : s), 0)
    : drill.total === 'income'
      ? drill.txns.reduce((s, t) => (isIncome(t) ? s - t.amount : s), 0)
      : drill.total === 'flow' ? drill.txns.reduce((s, t) => s - t.amount, 0) : null;
  const count = `${drill.txns.length} transaction${drill.txns.length === 1 ? '' : 's'}`;

  return (
    <Sheet
      open
      onClose={onClose}
      title={drill.title}
      subtitle={<>
        {drill.subtitle && <>{drill.subtitle} · </>}{count}
        {total != null && <> · <Money value={total} signed={drill.total === 'flow'} className="font-semibold text-ink" /></>}
      </>}
    >
      <TransactionList transactions={drill.txns} rules={rules} accountName={accountName} onSelect={onSelect} emptyText="Nothing here." />
    </Sheet>
  );
}

function MerchantSheet({ merchant, data, rules, accountName, onClose, onSelect }: {
  merchant: Extract<Drill, { kind: 'merchant' }>;
  data: DashboardData;
  rules: TxnRules;
  accountName: (id: string) => string | undefined;
  onClose: () => void;
  onSelect: (t: Txn) => void;
}) {
  const { hidden } = usePrivacy();
  const stats = useMemo(() => {
    const txns = data.transactions.filter(t => merchantKey(t) === merchant.key);
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const lastYear = txns.filter(t => t.date >= dayKey(yearAgo));
    // Mostly money in (a paycheck, refunds) or money out (a store)?
    const net = lastYear.reduce((s, t) => s + t.amount, 0);
    const inflow = net < 0;
    const relevant = lastYear.filter(t => (inflow ? t.amount < 0 : t.amount > 0));
    const total = Math.abs(relevant.reduce((s, t) => s + t.amount, 0));

    // Last 12 months, oldest first
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = dayKey(d).slice(0, 7);
      const amount = Math.abs(relevant.filter(t => t.date.startsWith(key)).reduce((s, t) => s + t.amount, 0));
      return { label: d.toLocaleDateString('en-US', { month: 'short' }), amount };
    });

    return {
      txns,
      inflow,
      total,
      count: relevant.length,
      average: relevant.length ? total / relevant.length : 0,
      last: txns[0]?.date ?? null,
      months,
      category: txns[0] ? rules.groupKey(txns[0]) : null,
    };
  }, [data, merchant.key, rules]);

  return (
    <Sheet open onClose={onClose} title={merchant.name} subtitle={stats.last ? `Last ${stats.inflow ? 'payment' : 'visit'}: ${friendlyDay(stats.last)}` : undefined}>
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <Stat label={stats.inflow ? 'Received, 12 mo' : 'Spent, 12 mo'} value={<Money value={stats.total} whole className={cn(stats.inflow && 'text-positive')} />} />
          <Stat label={stats.inflow ? 'Payments' : 'Visits'} value={<span className="tabular-nums">{stats.count}</span>} />
          <Stat label="Average" value={<Money value={stats.average} whole />} />
        </div>

        {stats.count > 0 && (
          <div>
            <SectionTitle>By month</SectionTitle>
            <div className={cn('h-32', hidden && 'blur-md')}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.months} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--faint)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
                  <Tooltip
                    cursor={{ fill: 'var(--sunken)' }}
                    contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13 }}
                    formatter={v => [formatMoney(Number(v)), stats.inflow ? 'Received' : 'Spent']}
                  />
                  <Bar dataKey="amount" fill={stats.inflow ? 'var(--positive)' : 'var(--accent)'} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
      <TransactionList transactions={stats.txns} rules={rules} accountName={accountName} onSelect={onSelect} />
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-sunken p-3">
      <p className="eyebrow text-[10px] text-muted">{label}</p>
      <p className="font-display text-2xl tracking-tight leading-none mt-1.5">{value}</p>
    </div>
  );
}

// Helpers for building drill-downs from anywhere
export function dayDrill(day: string, txns: Txn[], rules: TxnRules, accountId = 'all'): Drill {
  return {
    kind: 'txns',
    title: friendlyDay(day),
    subtitle: parseDay(day).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    txns: txns.filter(t => t.date === day && (accountId === 'all' || t.account_id === accountId) && rules.isSpending(t)),
    total: 'spending',
  };
}
