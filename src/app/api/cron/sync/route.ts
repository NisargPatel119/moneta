import { NextResponse, type NextRequest } from 'next/server';
import { errorMessage } from '@/lib/errors';
import { getFinancialData } from '@/lib/plaidData';

// Runs daily via Vercel Cron (see vercel.json): syncs new transactions and records today's
// balances, so net worth history builds up even on days you don't open the app.
// Vercel sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set on the project.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const data = await getFinancialData({ bypassCache: true, forceSync: true });
    return NextResponse.json({ ok: true, accounts: data.accounts.length, issues: data.issues.length });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
