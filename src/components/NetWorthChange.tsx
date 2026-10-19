'use client';
import { BUCKET_LABELS, type NetWorthBucket } from '@/lib/finance';
import type { NetWorthChange } from '@/lib/insights';
import { Money, cn } from './ui';

// Where a net worth change came from, one row per bucket (cash, investments, property, debts)
export function NetWorthChangeBreakdown({ change, onBucket }: {
  change: NetWorthChange;
  onBucket?: (bucket: NetWorthBucket) => void;
}) {
  if (change.buckets.length === 0) return null;
  const largest = Math.max(...change.buckets.map(b => Math.abs(b.effect)));
  const sorted = [...change.buckets].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));

  return (
    <ul className="space-y-2">
      {sorted.map(({ bucket, effect }) => {
        const market = bucket === 'investments' && change.contributions > 0 ? effect - change.contributions : null;
        const Row = onBucket ? 'button' : 'div';
        return (
          <li key={bucket}>
            <Row
              {...(onBucket ? { onClick: () => onBucket(bucket) } : {})}
              className={cn('w-full text-left block', onBucket && 'rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-sunken')}
            >
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-ink-2">
                  {BUCKET_LABELS[bucket]}
                  {(bucket === 'credit' || bucket === 'loans') && (
                    <span className="text-faint text-xs"> · {effect > 0 ? 'paid down' : 'owed more'}</span>
                  )}
                </span>
                <Money value={effect} signed whole className={cn('font-semibold', effect >= 0 ? 'text-positive' : 'text-negative')} />
              </div>
              <div className="h-1.5 bg-sunken rounded-full mt-1 overflow-hidden">
                <div
                  className={cn('h-full rounded-full', effect >= 0 ? 'bg-positive' : 'bg-negative')}
                  style={{ width: `${(Math.abs(effect) / largest) * 100}%` }}
                />
              </div>
              {market != null && (
                <p className="text-xs text-muted mt-1">
                  ≈ <Money value={market} signed whole /> from the market, <Money value={change.contributions} whole /> you added
                </p>
              )}
            </Row>
          </li>
        );
      })}
    </ul>
  );
}
