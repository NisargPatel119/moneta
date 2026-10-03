import { NextResponse } from 'next/server';
import { getFinancialData } from '@/lib/plaidData';

export async function GET() {
  try {
    // The dashboard always wants the latest data; the chat uses the short cache
    return NextResponse.json(await getFinancialData({ fresh: true }));
  } catch (error: any) {
    console.error('Error fetching dashboard data:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
