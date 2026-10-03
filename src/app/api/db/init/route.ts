import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/errors';
import { ensureSchema } from '@/lib/db';

// Optional: tables are also created automatically on first use
export async function GET() {
  try {
    await ensureSchema();
    return NextResponse.json({ message: 'Database initialized successfully!' });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
