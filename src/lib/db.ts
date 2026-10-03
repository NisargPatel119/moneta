import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

// neon() creates a standard sql tagged template function for executing queries
export const sql = neon(process.env.DATABASE_URL);

// Create tables on first use, so a fresh deploy needs no manual setup step
let schemaReady: Promise<void> | null = null;

export function ensureSchema() {
  schemaReady ??= sql`
    CREATE TABLE IF NOT EXISTS plaid_items (
      id SERIAL PRIMARY KEY,
      access_token VARCHAR(255) NOT NULL,
      item_id VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `.then(() => undefined).catch(e => {
    schemaReady = null; // retry on the next request
    throw e;
  });
  return schemaReady;
}
