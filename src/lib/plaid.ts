import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

// Plaid has two environments: sandbox (fake test banks) and production (real accounts).
// The old "development" environment was retired; treat it as production.
export const plaidEnv: 'sandbox' | 'production' =
  process.env.PLAID_ENV === 'production' || process.env.PLAID_ENV === 'development' ? 'production' : 'sandbox';

const configuration = new Configuration({
  basePath: PlaidEnvironments[plaidEnv],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);
