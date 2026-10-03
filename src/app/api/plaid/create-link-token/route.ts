import { NextResponse } from 'next/server';
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
      client_name: 'WealthSync',
      ...CONFIG[kind],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('Error creating link token:', error.response?.data || error.message);
    return NextResponse.json(
      { error: error.response?.data?.error_message || error.message },
      { status: 500 }
    );
  }
}
