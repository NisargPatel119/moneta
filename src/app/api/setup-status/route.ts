import { NextResponse } from 'next/server';
import { plaidEnv } from '@/lib/plaid';
import { isDemo } from '@/lib/demoData';

// Reports which settings are configured (never their values) so the app can show a setup checklist
export async function GET() {
  return NextResponse.json({
    database: !!process.env.DATABASE_URL,
    plaid: !!process.env.PLAID_CLIENT_ID && !!process.env.PLAID_SECRET,
    plaidEnv,
    plaidRedirect: !!process.env.PLAID_REDIRECT_URI,
    ai: !!process.env.GROQ_API_KEY,
    cron: !!process.env.CRON_SECRET,
    demo: isDemo(),
  });
}
