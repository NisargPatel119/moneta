import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { sql } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { public_token } = await request.json();

    // 1. Exchange the public token for a permanent access token
    const response = await plaidClient.itemPublicTokenExchange({
      public_token,
    });
    
    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;

    // 2. Save it securely to our Neon Postgres database
    await sql`
      INSERT INTO plaid_items (access_token, item_id)
      VALUES (${accessToken}, ${itemId})
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error exchanging public token:', error.response?.data || error.message);
    return NextResponse.json(
      { error: error.response?.data?.error_message || error.message }, 
      { status: 500 }
    );
  }
}
