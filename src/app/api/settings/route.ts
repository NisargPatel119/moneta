import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/errors';
import { getSettings, saveSettings } from '@/lib/settings';
import { clearFinancialCache } from '@/lib/plaidData';

export async function GET() {
  try {
    return NextResponse.json(await getSettings());
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

// Body: any of { transferRules, dismissedRecurring }
export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const settings = await saveSettings(body ?? {});
    // The AI chat reads cached data that includes these settings
    clearFinancialCache();
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
