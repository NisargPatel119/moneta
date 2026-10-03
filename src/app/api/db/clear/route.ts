import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/errors';
import { ensureSchema, sql } from '@/lib/db';
import { plaidClient } from '@/lib/plaid';
import { clearFinancialCache } from '@/lib/plaidData';

// Disconnects every linked account. POST only, so a link preview or prefetch can't trigger it.
export async function POST() {
  try {
    await ensureSchema();
    const items = await sql`SELECT access_token FROM plaid_items`;
    for (const item of items) {
      await plaidClient.itemRemove({ access_token: item.access_token }).catch(() => {});
    }
    await sql`DELETE FROM transactions`;
    await sql`DELETE FROM account_balances`;
    await sql`DELETE FROM plaid_items`;
    clearFinancialCache();
    return NextResponse.json({ message: 'All linked accounts cleared. Please re-link your bank accounts.' });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
