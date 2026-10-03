import { NextResponse, type NextRequest } from 'next/server';
import { ensureSchema, sql } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { clearFinancialCache } from '@/lib/plaidData';

// Delete a merchant rule: its transactions go back to Plaid's category (manual edits stay)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
