import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/errors';
import { getSettings, saveTransferRules } from '@/lib/settings';
import { clearFinancialCache } from '@/lib/plaidData';

export async function GET() {
  try {
    return NextResponse.json(await getSettings());
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const transferRules = await saveTransferRules(body.transferRules);
    // The AI chat reads cached data that includes these rules
    clearFinancialCache();
    return NextResponse.json({ transferRules });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
