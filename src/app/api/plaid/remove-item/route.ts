import { NextResponse } from 'next/server';
import { errorMessage, plaidErrorBody } from '@/lib/errors';
import { plaidClient } from '@/lib/plaid';
import { sql } from '@/lib/db';
import { clearFinancialCache } from '@/lib/plaidData';

// Disconnect one bank: revoke it at Plaid (stops billing for the Item) and delete its token
export async function POST(request: Request) {
  const { item_id } = await request.json().catch(() => ({}));
  if (typeof item_id !== 'string' || !item_id) {
    return NextResponse.json({ error: 'item_id is required' }, { status: 400 });
  }

  const rows = await sql`SELECT access_token FROM plaid_items WHERE item_id = ${item_id}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }

  for (const row of rows) {
    try {
      await plaidClient.itemRemove({ access_token: row.access_token });
    } catch (e) {
      // Already removed at Plaid (or invalid): still delete our copy
      console.error('itemRemove failed:', plaidErrorBody(e) || errorMessage(e));
    }
  }
  // Its stored history goes too, so old balances don't linger in net worth
  await sql`DELETE FROM transactions WHERE item_id = ${item_id}`;
  await sql`DELETE FROM account_balances WHERE item_id = ${item_id}`;
  await sql`DELETE FROM plaid_items WHERE item_id = ${item_id}`;
  clearFinancialCache();
  return NextResponse.json({ success: true });
}
