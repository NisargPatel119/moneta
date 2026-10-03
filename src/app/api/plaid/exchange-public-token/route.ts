import { NextResponse } from 'next/server';
import { isDemo } from '@/lib/demoData';
import { describeError, errorMessage, plaidErrorBody } from '@/lib/errors';
import { plaidClient } from '@/lib/plaid';
import { ensureSchema, sql } from '@/lib/db';
import { clearFinancialCache } from '@/lib/plaidData';

export async function POST(request: Request) {
  if (isDemo()) {
    return NextResponse.json({ error: 'Linking accounts is turned off in the demo. Deploy your own copy of Moneta to connect your banks.' }, { status: 400 });
  }
  try {
    const { public_token } = await request.json();

    // 1. Exchange the public token for a permanent access token
    const response = await plaidClient.itemPublicTokenExchange({
      public_token,
    });
    
    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;

    // 2. Save it securely to our Neon Postgres database
    await ensureSchema();
    await sql`
      INSERT INTO plaid_items (access_token, item_id)
      VALUES (${accessToken}, ${itemId})
    `;

    clearFinancialCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error exchanging public token:', plaidErrorBody(error) || errorMessage(error));
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}
