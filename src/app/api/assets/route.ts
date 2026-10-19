import { NextResponse } from 'next/server';
import { isDemo } from '@/lib/demoData';
import { errorMessage } from '@/lib/errors';
import { createManualAsset, parseAssetInput, type AssetInput } from '@/lib/manualAssets';
import { clearFinancialCache } from '@/lib/plaidData';

// Body: { name, kind, value, annual_rate?, notes? }
export async function POST(request: Request) {
  const parsed = parseAssetInput(await request.json().catch(() => ({})));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  // Demo mode: pretend it worked; the page keeps the change for this visit only
  if (isDemo()) return NextResponse.json({ success: true, demo: true });
  try {
    const asset = await createManualAsset(parsed.input as AssetInput);
    clearFinancialCache();
    return NextResponse.json(asset);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
