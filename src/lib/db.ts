import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

// neon() creates a standard sql tagged template function for executing queries
export const sql = neon(process.env.DATABASE_URL);
