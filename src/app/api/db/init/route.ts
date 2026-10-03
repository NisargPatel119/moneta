import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS plaid_items (
        id SERIAL PRIMARY KEY,
        access_token VARCHAR(255) NOT NULL,
        item_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    return NextResponse.json({ message: 'Database initialized successfully!' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
