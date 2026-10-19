import { NextResponse } from 'next/server';
import { isDemo } from '@/lib/demoData';
import { ensureSchema, sql } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { clearFinancialCache } from '@/lib/plaidData';

// Body: { ids: string[], reviewed?: boolean } — checks transactions off in the review inbox
// (reviewed: false puts them back, for undo)
export async function POST(request: Request) {
  // Demo mode: pretend it worked; the page keeps the change for this visit only
  if (isDemo()) return NextResponse.json({ success: true, demo: true });
  try {
    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown): id is string => typeof id === 'string').slice(0, 1000) : [];
    if (ids.length === 0) return NextResponse.json({ error: 'ids is required' }, { status: 400 });
    const reviewed = body.reviewed !== false;

    await ensureSchema();
    await sql`UPDATE transactions SET reviewed = ${reviewed} WHERE transaction_id = ANY(${ids}::text[])`;
    clearFinancialCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
