import { ensureSchema, sql } from '@/lib/db';
import { sanitizeTransferRules, type TransferRules } from '@/lib/transfers';
import { sanitizePlan, type ForecastPlan } from '@/lib/forecast';
import { sanitizeScenarios, type ForecastScenario } from '@/lib/forecastScenarios';

export type AppSettings = {
  transferRules: TransferRules;
  /** Merchant keys the user said aren't really recurring */
  dismissedRecurring: string[];
  /** Inputs and assumptions for the net worth forecast */
  forecastPlan: ForecastPlan;
  /** Named copies of the plan with changes, for comparing */
  forecastScenarios: ForecastScenario[];
};

function sanitizeDismissed(input: unknown): string[] {
  return Array.isArray(input) ? input.filter((k): k is string => typeof k === 'string').slice(0, 500) : [];
}

export async function getSettings(): Promise<AppSettings> {
  await ensureSchema();
  const rows = (await sql`
    SELECT key, value FROM app_settings WHERE key IN ('transfer_rules', 'dismissed_recurring', 'forecast_plan', 'forecast_scenarios')
  `) as { key: string; value: unknown }[];
  const get = (key: string) => rows.find(r => r.key === key)?.value;
  return {
    transferRules: sanitizeTransferRules(get('transfer_rules')),
    dismissedRecurring: sanitizeDismissed(get('dismissed_recurring')),
    forecastPlan: sanitizePlan(get('forecast_plan')),
    forecastScenarios: sanitizeScenarios(get('forecast_scenarios')),
  };
}

async function save(key: string, value: unknown) {
  await ensureSchema();
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `;
}

// Saves whichever settings are present in the input; returns the full, cleaned settings
export async function saveSettings(input: Partial<Record<keyof AppSettings, unknown>>): Promise<AppSettings> {
  if ('transferRules' in input) await save('transfer_rules', sanitizeTransferRules(input.transferRules));
  if ('dismissedRecurring' in input) await save('dismissed_recurring', sanitizeDismissed(input.dismissedRecurring));
  if ('forecastPlan' in input) await save('forecast_plan', sanitizePlan(input.forecastPlan));
  if ('forecastScenarios' in input) await save('forecast_scenarios', sanitizeScenarios(input.forecastScenarios));
  return getSettings();
}
