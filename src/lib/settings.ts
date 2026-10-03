import { ensureSchema, sql } from '@/lib/db';
import { sanitizeTransferRules, type TransferRules } from '@/lib/transfers';

export type AppSettings = { transferRules: TransferRules };

export async function getSettings(): Promise<AppSettings> {
  await ensureSchema();
  const rows = await sql`SELECT value FROM app_settings WHERE key = 'transfer_rules'`;
  return { transferRules: sanitizeTransferRules(rows[0]?.value) };
}

export async function saveTransferRules(input: unknown): Promise<TransferRules> {
  const rules = sanitizeTransferRules(input);
  await ensureSchema();
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('transfer_rules', ${JSON.stringify(rules)}::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `;
  return rules;
}
