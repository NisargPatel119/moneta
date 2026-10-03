import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { CountryCode, Products } from 'plaid';

export async function POST() {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: {
        // Since this is a personal app for just you, we can hardcode a user ID
        client_user_id: 'personal-user-id', 
      },
      client_name: 'WealthSync',
      products: [Products.Transactions, Products.Investments],
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
