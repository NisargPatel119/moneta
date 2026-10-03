import { NextResponse, type NextRequest } from 'next/server';
import { errorMessage } from '@/lib/errors';
import { getFinancialData } from '@/lib/plaidData';

export async function GET(request: NextRequest) {
  try {
    // The dashboard always skips the chat's short cache. ?refresh=1 (the refresh button)
    // also forces a transaction sync even if the last one was recent.
    const forceSync = request.nextUrl.searchParams.get('refresh') === '1';
    return NextResponse.json(await getFinancialData({ bypassCache: true, forceSync }));
  } catch (error) {
    console.error('Error fetching dashboard data:', errorMessage(error));
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
