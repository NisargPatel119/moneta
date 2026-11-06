import { NextResponse, type NextRequest } from 'next/server';
import { demoSecurityHistory, isDemo } from '@/lib/demoData';
import { ensureSchema } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { readSecurityHistory } from '@/lib/investmentStore';

// GET ?id=<security_id>&accounts=<account_id>,<account_id> — one holding's value per day
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  const accounts = (request.nextUrl.searchParams.get('accounts') ?? '').split(',').filter(Boolean).slice(0, 200);
  if (!id || accounts.length === 0) return NextResponse.json({ error: 'id and accounts are required' }, { status: 400 });
  try {
    if (isDemo()) return NextResponse.json(demoSecurityHistory(id, accounts));
    await ensureSchema();
    return NextResponse.json(await readSecurityHistory(id, accounts));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
