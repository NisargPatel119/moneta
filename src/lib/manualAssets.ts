import { ensureSchema, sql } from '@/lib/db';
import { ASSET_KINDS, dayKey, projectAssetValue, type AssetKind, type ManualAsset } from '@/lib/finance';

// Manual assets share the balance history table with linked accounts, under these ids
export const MANUAL_ITEM_ID = 'manual';
export const manualAccountId = (id: number) => `manual:${id}`;

type AssetRow = {
  id: number; name: string; kind: string; value: number; value_date: string;
  annual_rate: number | null; notes: string | null;
};

export type AssetInput = {
  name: string;
  kind: AssetKind;
  value: number;
  annual_rate: number | null;
  notes: string | null;
};

// Checks what came from the browser; returns an error message or the cleaned values
export function parseAssetInput(body: unknown, partial = false): { error: string } | { input: Partial<AssetInput> } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const input: Partial<AssetInput> = {};

  if ('name' in b || !partial) {
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
    if (!name) return { error: 'Give the asset a name.' };
    input.name = name;
  }
  if ('kind' in b || !partial) {
    if (!ASSET_KINDS.includes(b.kind as AssetKind)) return { error: 'Unknown asset type.' };
    input.kind = b.kind as AssetKind;
  }
  if ('value' in b || !partial) {
    const value = Number(b.value);
    if (!Number.isFinite(value) || value < 0 || value > 1e11) return { error: 'Enter a value of $0 or more.' };
    input.value = Math.round(value * 100) / 100;
  }
  if ('annual_rate' in b) {
    if (b.annual_rate == null || b.annual_rate === '') input.annual_rate = null;
    else {
      const rate = Number(b.annual_rate);
      if (!Number.isFinite(rate) || rate < -50 || rate > 50) return { error: 'Yearly change must be between −50% and +50%.' };
      input.annual_rate = rate === 0 ? null : rate;
    }
  }
  if ('notes' in b) {
    input.notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 500) : null;
  }
  return { input };
}

function toAsset(r: AssetRow, today: string): ManualAsset {
  return {
    id: r.id,
    name: r.name,
    kind: (ASSET_KINDS.includes(r.kind as AssetKind) ? r.kind : 'other') as AssetKind,
    value: projectAssetValue(r.value, r.annual_rate, r.value_date, today),
    entered_value: r.value,
    value_date: r.value_date,
    annual_rate: r.annual_rate,
    notes: r.notes,
  };
}

export async function readManualAssets(): Promise<ManualAsset[]> {
  await ensureSchema();
  const rows = (await sql`
    SELECT id, name, kind, value, value_date, annual_rate, notes FROM manual_assets ORDER BY created_at
  `) as AssetRow[];
  const today = dayKey(new Date());
  return rows.map(r => toAsset(r, today));
}

// Records today's value of each manual asset, so they show up in net worth over time
export async function snapshotManualAssets(assets: ManualAsset[]) {
  if (assets.length === 0) return;
  const today = dayKey(new Date());
  await sql`
    INSERT INTO account_balances (date, account_id, item_id, type, current)
    SELECT * FROM UNNEST(
      ${assets.map(() => today)}::text[],
      ${assets.map(a => manualAccountId(a.id))}::text[],
      ${assets.map(() => MANUAL_ITEM_ID)}::text[],
      ${assets.map(() => 'manual')}::text[],
      ${assets.map(a => a.value)}::float8[]
    )
    ON CONFLICT (date, account_id) DO UPDATE SET current = EXCLUDED.current
  `;
}

export async function createManualAsset(input: AssetInput): Promise<ManualAsset> {
  await ensureSchema();
  const today = dayKey(new Date());
  const rows = (await sql`
    INSERT INTO manual_assets (name, kind, value, value_date, annual_rate, notes)
    VALUES (${input.name}, ${input.kind}, ${input.value}, ${today}, ${input.annual_rate ?? null}, ${input.notes ?? null})
    RETURNING id, name, kind, value, value_date, annual_rate, notes
  `) as AssetRow[];
  const asset = toAsset(rows[0], today);
  await snapshotManualAssets([asset]);
  return asset;
}

export async function updateManualAsset(id: number, input: Partial<AssetInput>): Promise<ManualAsset | null> {
  await ensureSchema();
  const today = dayKey(new Date());
  // A new value restarts the yearly drift from today
  const rows = (await sql`
    UPDATE manual_assets SET
      name = COALESCE(${input.name ?? null}, name),
      kind = COALESCE(${input.kind ?? null}, kind),
      value = COALESCE(${input.value ?? null}, value),
      value_date = CASE WHEN ${input.value !== undefined} THEN ${today} ELSE value_date END,
      annual_rate = CASE WHEN ${'annual_rate' in input} THEN ${input.annual_rate ?? null} ELSE annual_rate END,
      notes = CASE WHEN ${'notes' in input} THEN ${input.notes ?? null} ELSE notes END
    WHERE id = ${id}
    RETURNING id, name, kind, value, value_date, annual_rate, notes
  `) as AssetRow[];
  if (rows.length === 0) return null;
  const asset = toAsset(rows[0], today);
  await snapshotManualAssets([asset]);
  return asset;
}

export async function deleteManualAsset(id: number) {
  await ensureSchema();
  await sql`DELETE FROM manual_assets WHERE id = ${id}`;
  // Its history goes too, so net worth over time doesn't keep a ghost
  await sql`DELETE FROM account_balances WHERE account_id = ${manualAccountId(id)}`;
}
