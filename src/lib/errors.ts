// Plaid's SDK throws axios errors; the useful details live in response.data
export type PlaidErrorBody = { error_code?: string; error_message?: string; display_message?: string | null };

export function plaidErrorBody(e: unknown): PlaidErrorBody | undefined {
  return (e as { response?: { data?: PlaidErrorBody } } | null)?.response?.data;
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

// Best human-readable message for an error from Plaid or anywhere else
export function describeError(e: unknown) {
  const body = plaidErrorBody(e);
  return body?.display_message || body?.error_message || errorMessage(e);
}
