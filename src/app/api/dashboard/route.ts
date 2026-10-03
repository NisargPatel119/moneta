import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { plaidClient } from '@/lib/plaid';

export async function GET() {
  try {
    // 1. Fetch all securely saved access tokens from the database
    const items = await sql`SELECT access_token FROM plaid_items`;
    
    if (items.length === 0) {
      return NextResponse.json({ linked: false, netWorth: 0, transactions: [], accounts: [] });
    }

    let totalAssets = 0;
    let totalLiabilities = 0;
    let allTransactions: any[] = [];
    let allAccounts: any[] = [];
    
    // Set date range for the last 30 days of transactions
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);
    const endStr = endDate.toISOString().split('T')[0];
    const startStr = startDate.toISOString().split('T')[0];

    // 2. Request real-time data from Plaid for each connected bank
    for (const item of items) {
      const accessToken = item.access_token;
      
      try {
        // --- Fetch Balances ---
        const balanceResponse = await plaidClient.accountsBalanceGet({ access_token: accessToken });
        const accounts = balanceResponse.data.accounts;
        allAccounts = allAccounts.concat(accounts);
        
        accounts.forEach(acc => {
          const balance = acc.balances.current || 0;
          if (acc.type === 'credit' || acc.type === 'loan') {
            totalLiabilities += balance;
          } else {
            totalAssets += balance;
          }
        });

        // --- Fetch Transactions ---
        const txnResponse = await plaidClient.transactionsGet({
          access_token: accessToken,
          start_date: startStr,
          end_date: endStr,
          options: { count: 100 }
        });
        allTransactions = allTransactions.concat(txnResponse.data.transactions);
      } catch (e: any) {
        console.error("Error fetching data for an item:", e.response?.data || e.message);
      }
    }

    const netWorth = totalAssets - totalLiabilities;
    
    // Sort transactions by most recent
    allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ 
      linked: true, 
      netWorth, 
      assets: totalAssets, 
      liabilities: totalLiabilities,
      transactions: allTransactions,
      accounts: allAccounts
    });

  } catch (error: any) {
    console.error('Error fetching dashboard data:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
