import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
  try {
    await sql`DELETE FROM plaid_items`;
    return NextResponse.json({ message: 'All linked accounts cleared. Please re-link your bank accounts.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
