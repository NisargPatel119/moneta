import { NextResponse, type NextRequest } from 'next/server';
import { isDemo } from '@/lib/demoData';
import { ensureSchema, sql } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { EDITABLE_CATEGORIES, merchantKey } from '@/lib/finance';
import { clearFinancialCache } from '@/lib/plaidData';

type EditBody = {
  /** A Plaid primary category, or null to go back to automatic */
  category?: string | null;
  /** A display name, or null to go back to the bank's name */
  name?: string | null;
  notes?: string | null;
  /** Also create/update a rule so every transaction from this merchant gets the same edit */
  applyToMerchant?: boolean;
};

const clean = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Demo mode: pretend it worked; the page keeps the change for this visit only
  if (isDemo()) return NextResponse.json({ success: true, demo: true });
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as EditBody;
    if ('category' in body && body.category != null && !EDITABLE_CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: 'Unknown category' }, { status: 400 });
    }

    await ensureSchema();
    const rows = await sql`SELECT name, merchant_name FROM transactions WHERE transaction_id = ${id}`;
    if (rows.length === 0) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

    const category = 'category' in body ? (body.category ?? null) : undefined;
    const name = 'name' in body ? clean(body.name, 120) : undefined;
    const notes = 'notes' in body ? clean(body.notes, 1000) : undefined;

    if (body.applyToMerchant) {
      // The rule now decides category/name for this merchant, so clear this row's own
      // overrides; otherwise they'd hide future rule changes.
      const key = merchantKey(rows[0] as { name: string; merchant_name: string | null });
      await sql`
        INSERT INTO category_rules (merchant_key, category, rename)
        VALUES (${key}, ${category ?? null}, ${name ?? null})
        ON CONFLICT (merchant_key) DO UPDATE SET category = EXCLUDED.category, rename = EXCLUDED.rename
      `;
      await sql`
        UPDATE transactions SET user_category = NULL, user_name = NULL,
          notes = CASE WHEN ${notes !== undefined} THEN ${notes ?? null} ELSE notes END, updated_at = NOW()
        WHERE transaction_id = ${id}
      `;
    } else {
      await sql`
        UPDATE transactions SET
          user_category = CASE WHEN ${category !== undefined} THEN ${category ?? null} ELSE user_category END,
          user_name = CASE WHEN ${name !== undefined} THEN ${name ?? null} ELSE user_name END,
          notes = CASE WHEN ${notes !== undefined} THEN ${notes ?? null} ELSE notes END,
          updated_at = NOW()
        WHERE transaction_id = ${id}
      `;
    }

    clearFinancialCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
