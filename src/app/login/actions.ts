'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, SESSION_MAX_AGE, checkPassword, createSessionToken } from '@/lib/session';

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  if (!process.env.APP_PASSWORD) {
    return { error: 'APP_PASSWORD is not configured on the server.' };
  }

  const password = String(formData.get('password') ?? '');
  if (!(await checkPassword(password))) {
    // Slow down brute-force attempts
    await new Promise(r => setTimeout(r, 1000));
    return { error: 'Incorrect password.' };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });

  redirect('/');
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect('/login');
}
