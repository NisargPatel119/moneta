import { NextResponse } from 'next/server';
import { isDemo } from '@/lib/demoData';
import { ensureSchema, sql } from '@/lib/db';
import { describeError, errorMessage, plaidErrorBody } from '@/lib/errors';
import { plaidClient } from '@/lib/plaid';
import { CountryCode, Products, type LinkTokenCreateRequest } from 'plaid';

// Plaid hides any institution that doesn't support every product in `products`,
// so banks and brokerages need different link configurations:
// - bank: must have transactions; pull investments too if the bank offers them
// - brokerage: must have investments; pull transactions too if offered
const CONFIG = {
  bank: { products: [Products.Transactions], required_if_supported_products: [Products.Investments] },
  brokerage: { products: [Products.Investments], required_if_supported_products: [Products.Transactions] },
};

// Body: { kind: 'bank' | 'brokerage' } to link something new, or
// { item_id, mode: 'reconnect' | 'consent' } to fix an existing connection in Plaid's "update mode".
// Update mode signs the user back in to the same connection, so history, edits and the
// connection itself are kept (re-linking from scratch would create a duplicate).
export async function POST(request: Request) {
  if (isDemo()) {
    return NextResponse.json({ error: 'Linking accounts is turned off in the demo. Deploy your own copy of Moneta to connect your banks.' }, { status: 400 });
  }
  try {
    const body = await request.json().catch(() => ({}));

    const base = {
      user: {
        // Since this is a personal app for just you, we can hardcode a user ID
        client_user_id: 'personal-user-id',
      },
      client_name: 'Moneta',
      country_codes: [CountryCode.Us],
      language: 'en',
      // Banks that use OAuth (Chase, Capital One, …) send phone users back here after signing in.
      // Must be HTTPS and listed under "Allowed redirect URIs" in the Plaid dashboard.
      ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}),
    };

    let config: LinkTokenCreateRequest;
    if (typeof body.item_id === 'string' && body.item_id) {
      await ensureSchema();
      const rows = await sql`SELECT access_token FROM plaid_items WHERE item_id = ${body.item_id}`;
      if (rows.length === 0) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
      config = {
        ...base,
        access_token: rows[0].access_token as string,
        // Products are omitted in update mode. To see holdings at a bank that was linked without
        // investment access, ask for that consent now.
        ...(body.mode === 'consent' ? { additional_consented_products: [Products.Investments] } : {}),
      };
    } else {
      const kind: keyof typeof CONFIG = body.kind === 'brokerage' ? 'brokerage' : 'bank';
      config = {
        ...base,
        ...CONFIG[kind],
        // Ask for up to 2 years of transaction history (the default is 90 days)
        transactions: { days_requested: 730 },
      };
    }

    const response = await plaidClient.linkTokenCreate(config);
    return NextResponse.json(response.data);
  } catch (error) {
    console.error('Error creating link token:', plaidErrorBody(error) || errorMessage(error));
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}
