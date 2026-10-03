import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/errors';
import { getFinancialData } from '@/lib/plaidData';

export async function GET() {
  try {
    // The dashboard always wants the latest data; the chat uses the short cache
    return NextResponse.json(await getFinancialData({ fresh: true }));
  } catch (error) {
    console.error('Error fetching dashboard data:', errorMessage(error));
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
