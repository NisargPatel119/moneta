import { NextResponse, type NextRequest } from 'next/server';
import { isDemo } from '@/lib/demoData';
import { ensureSchema, sql } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { clearFinancialCache } from '@/lib/plaidData';

// Delete a merchant rule: its transactions go back to Plaid's category (manual edits stay)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Demo mode: pretend it worked; the page keeps the change for this visit only
  if (isDemo()) return NextResponse.json({ success: true, demo: true });
  try {
    const { id } = await params;
    await ensureSchema();
    await sql`DELETE FROM category_rules WHERE id = ${Number(id)}`;
    clearFinancialCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
