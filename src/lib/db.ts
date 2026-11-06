import { neon } from '@neondatabase/serverless';

// neon() creates a standard sql tagged template function for executing queries.
// Without DATABASE_URL (e.g. demo mode) the app still starts; queries fail with a clear message.
const connect = () => neon(process.env.DATABASE_URL!);
export const sql: ReturnType<typeof connect> = process.env.DATABASE_URL
  ? connect()
  : ((() => { throw new Error('DATABASE_URL is not set'); }) as unknown as ReturnType<typeof connect>);

// Create tables on first use (and add newer columns), so a fresh deploy or an upgrade
// needs no manual setup step. Every statement is idempotent.
let schemaReady: Promise<void> | null = null;

export function ensureSchema() {
  schemaReady ??= (async () => {
    await Promise.all([
      sql`
        CREATE TABLE IF NOT EXISTS plaid_items (
          id SERIAL PRIMARY KEY,
          access_token VARCHAR(255) NOT NULL,
          item_id VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
      // App preferences that should sync across devices (e.g. transfer rules)
      sql`
        CREATE TABLE IF NOT EXISTS app_settings (
          key VARCHAR(100) PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
      // Transactions are stored so history outlives Plaid's window and edits persist.
      // Dates are 'YYYY-MM-DD' text: they sort correctly and avoid time zone shifts.
      sql`
        CREATE TABLE IF NOT EXISTS transactions (
          transaction_id TEXT PRIMARY KEY,
          item_id TEXT NOT NULL,
          account_id TEXT NOT NULL,
          date TEXT NOT NULL,
          amount DOUBLE PRECISION NOT NULL,
          name TEXT NOT NULL,
          merchant_name TEXT,
          pending BOOLEAN NOT NULL DEFAULT FALSE,
          pending_transaction_id TEXT,
          logo_url TEXT,
          pfc_primary TEXT,
          pfc_detailed TEXT,
          user_category TEXT,
          user_name TEXT,
          notes TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
      // One balance per account per day, for net worth over time
      sql`
        CREATE TABLE IF NOT EXISTS account_balances (
          date TEXT NOT NULL,
          account_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          type TEXT,
          current DOUBLE PRECISION,
          PRIMARY KEY (date, account_id)
        )
      `,
      // "Always categorize <merchant> as <category>" rules, created by editing a transaction
      sql`
        CREATE TABLE IF NOT EXISTS category_rules (
          id SERIAL PRIMARY KEY,
          merchant_key TEXT NOT NULL UNIQUE,
          category TEXT,
          rename TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
      // Each holding's value per day, for the Investments chart, its filters, and holding history
      sql`
        CREATE TABLE IF NOT EXISTS holding_snapshots (
          date TEXT NOT NULL,
          account_id TEXT NOT NULL,
          security_id TEXT NOT NULL,
          ticker TEXT,
          name TEXT,
          type TEXT,
          quantity DOUBLE PRECISION,
          price DOUBLE PRECISION,
          value DOUBLE PRECISION,
          PRIMARY KEY (date, account_id, security_id)
        )
      `,
      // Things Plaid can't see: a home, a car, crypto in a wallet, valuables…
      // The value can drift by a yearly rate (a home appreciating, a car depreciating).
      sql`
        CREATE TABLE IF NOT EXISTS manual_assets (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          kind TEXT NOT NULL,
          value DOUBLE PRECISION NOT NULL,
          value_date TEXT NOT NULL,
          annual_rate DOUBLE PRECISION,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
    ]);
    await Promise.all([
      sql`ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS sync_cursor TEXT`,
      sql`ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ`,
      // Remembered so a bank that stops responding can still be named ("Reconnect Chase")
      sql`ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS institution_name TEXT`,
      sql`CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (date)`,
      // Review inbox. Rows that existed before this column count as reviewed (the default
      // applies to them when the column is added); the next statement makes new rows unreviewed.
      sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reviewed BOOLEAN NOT NULL DEFAULT TRUE`,
    ]);
    await sql`ALTER TABLE transactions ALTER COLUMN reviewed SET DEFAULT FALSE`;
  })().catch(e => {
    schemaReady = null; // retry on the next request
    throw e;
  });
  return schemaReady;
}
