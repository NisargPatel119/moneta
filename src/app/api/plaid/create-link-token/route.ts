import { NextResponse } from 'next/server';
import { describeError, errorMessage, plaidErrorBody } from '@/lib/errors';
import { plaidClient } from '@/lib/plaid';
import { CountryCode, Products } from 'plaid';

// Plaid hides any institution that doesn't support every product in `products`,
// so banks and brokerages need different link configurations:
// - bank: must have transactions; pull investments too if the bank offers them
// - brokerage: must have investments; pull transactions too if offered
const CONFIG = {
  bank: { products: [Products.Transactions], required_if_supported_products: [Products.Investments] },
  brokerage: { products: [Products.Investments], required_if_supported_products: [Products.Transactions] },
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const kind: keyof typeof CONFIG = body.kind === 'brokerage' ? 'brokerage' : 'bank';

    const response = await plaidClient.linkTokenCreate({
      user: {
        // Since this is a personal app for just you, we can hardcode a user ID
        client_user_id: 'personal-user-id',
      },
      client_name: 'Moneta',
      ...CONFIG[kind],
      // Ask for up to 2 years of transaction history (the default is 90 days)
      transactions: { days_requested: 730 },
      country_codes: [CountryCode.Us],
      language: 'en',
      // Banks that use OAuth (Chase, Capital One, …) send phone users back here after signing in.
      // Must be HTTPS and listed under "Allowed redirect URIs" in the Plaid dashboard.
      ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}),
    });
    return NextResponse.json(response.data);
  } catch (error) {
    console.error('Error creating link token:', plaidErrorBody(error) || errorMessage(error));
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}
