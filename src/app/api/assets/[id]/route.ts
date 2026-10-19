import { NextResponse, type NextRequest } from 'next/server';
import { isDemo } from '@/lib/demoData';
import { errorMessage } from '@/lib/errors';
import { deleteManualAsset, parseAssetInput, updateManualAsset } from '@/lib/manualAssets';
import { clearFinancialCache } from '@/lib/plaidData';

type Params = { params: Promise<{ id: string }> };

async function assetId(params: Params['params']) {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Body: any of { name, kind, value, annual_rate, notes }
export async function PATCH(request: NextRequest, { params }: Params) {
  const id = await assetId(params);
  if (!id) return NextResponse.json({ error: 'Unknown asset' }, { status: 404 });
  const parsed = parseAssetInput(await request.json().catch(() => ({})), true);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (isDemo()) return NextResponse.json({ success: true, demo: true });
  try {
    const asset = await updateManualAsset(id, parsed.input);
    if (!asset) return NextResponse.json({ error: 'Unknown asset' }, { status: 404 });
    clearFinancialCache();
    return NextResponse.json(asset);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const id = await assetId(params);
  if (!id) return NextResponse.json({ error: 'Unknown asset' }, { status: 404 });
  if (isDemo()) return NextResponse.json({ success: true, demo: true });
  try {
    await deleteManualAsset(id);
    clearFinancialCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
