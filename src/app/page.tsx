'use client';
import { useEffect, useState, useMemo } from 'react';
import LinkBank from '@/components/LinkBank';
import { 
  LineChart, 
  Building2, 
  LayoutDashboard, 
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  Wallet,
  Landmark
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export default function Home() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'accounts'>('overview');
  
  // New state for filtering transactions by account
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');

  const loadDashboard = () => {
    setLoading(true);
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  // Filter transactions based on selected account
  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return [];
    if (selectedAccountId === 'all') return data.transactions;
    return data.transactions.filter((t: any) => t.account_id === selectedAccountId);
  }, [data, selectedAccountId]);

  // Aggregate spend data for the bar chart (last 30 days)
  const chartData = useMemo(() => {
    if (!data?.transactions) return [];
    
    // Generate an array of the last 30 dates
    const last30Days = [...Array(30)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      return d.toISOString().split('T')[0];
    });
    
    return last30Days.map(dateStr => {
      const dayTransactions = filteredTransactions.filter((t: any) => t.date === dateStr && t.amount > 0);
      const totalSpend = dayTransactions.reduce((sum: number, t: any) => sum + t.amount, 0);
      return {
        date: new Date(dateStr).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}),
        spend: totalSpend
      };
    });
  }, [filteredTransactions, data]);

  // Group accounts by product type
  const groupedAccounts = useMemo(() => {
    if (!data?.accounts) return {};
    return data.accounts.reduce((acc: any, account: any) => {
      const type = account.type || 'other'; 
      if (!acc[type]) acc[type] = [];
      acc[type].push(account);
      return acc;
    }, {});
  }, [data]);

  const typeLabels: Record<string, string> = {
    depository: "Cash & Checking",
    credit: "Credit Cards",
    loan: "Loans",
    investment: "Investments",
    other: "Other Accounts"
  };

  const getAccountName = (accountId: string) => {
    const acc = data?.accounts?.find((a: any) => a.account_id === accountId);
    return acc ? acc.name : 'Unknown Account';
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500 font-medium bg-[#F8FAFC]">Syncing with your banks...</div>;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900 selection:bg-blue-100">
      
      {/* Top Navbar */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2 rounded-xl shadow-inner shadow-blue-700/50">
            <LineChart size={24} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">WealthSync</h1>
        </div>
        <LinkBank />
      </nav>

      <main className="max-w-6xl mx-auto p-6 md:p-10">
        {!data?.linked ? (
          <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center shadow-sm max-w-lg mx-auto mt-10">
            <div className="mx-auto w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 text-blue-600">
              <Building2 size={32} />
            </div>
            <h2 className="text-2xl font-semibold text-slate-900">Connect your accounts</h2>
            <p className="text-slate-500 mt-3 max-w-sm mx-auto leading-relaxed">
              Link your bank or investment accounts securely using Plaid to calculate your net worth and track spending.
            </p>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-10">
            
            {/* Sidebar Navigation */}
            <aside className="w-full md:w-64 shrink-0 space-y-2">
              <button 
                onClick={() => setActiveTab('overview')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold transition-all duration-200", 
                  activeTab === 'overview' ? "bg-blue-600 text-white shadow-md shadow-blue-600/20" : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
                )}
              >
                <LayoutDashboard size={20} className={activeTab === 'overview' ? "text-blue-100" : "text-slate-400"} />
                Net Worth
              </button>
              
              <button 
                onClick={() => setActiveTab('transactions')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold transition-all duration-200", 
                  activeTab === 'transactions' ? "bg-blue-600 text-white shadow-md shadow-blue-600/20" : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
                )}
              >
                <Activity size={20} className={activeTab === 'transactions' ? "text-blue-100" : "text-slate-400"} />
                Monthly Spend
              </button>

              <button 
                onClick={() => setActiveTab('accounts')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold transition-all duration-200", 
                  activeTab === 'accounts' ? "bg-blue-600 text-white shadow-md shadow-blue-600/20" : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
                )}
              >
                <Building2 size={20} className={activeTab === 'accounts' ? "text-blue-100" : "text-slate-400"} />
                Balances
              </button>
            </aside>

            {/* Main Content Area */}
            <section className="flex-1 min-w-0">
              
              {/* --- TAB: OVERVIEW (Net Worth) --- */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <h2 className="text-xl font-bold mb-4">Financial Overview</h2>
                  
                  <div className="grid grid-cols-1 gap-6">
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-8 opacity-10">
                        <Wallet size={120} />
                      </div>
                      <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-2">Total Net Worth</p>
                      <p className="text-5xl md:text-6xl font-black tracking-tight text-slate-900">
                        {data.netWorth?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="bg-green-100 p-4 rounded-2xl text-green-600">
                          <ArrowUpRight size={28} />
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Total Assets</p>
                          <p className="text-3xl font-bold text-slate-900">
                            {data.assets?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                          </p>
                        </div>
                      </div>
                      
                      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="bg-red-100 p-4 rounded-2xl text-red-600">
                          <ArrowDownRight size={28} />
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Total Liabilities</p>
                          <p className="text-3xl font-bold text-slate-900">
                            {data.liabilities?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* --- TAB: TRANSACTIONS (Monthly Spend) --- */}
              {activeTab === 'transactions' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <h2 className="text-xl font-bold">Monthly Spend Analysis</h2>
                    
                    <select 
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="bg-white border border-slate-300 text-slate-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5 font-medium shadow-sm outline-none"
                    >
                      <option value="all">All Linked Accounts</option>
                      {Object.keys(groupedAccounts).map((type) => (
                        <optgroup key={type} label={typeLabels[type] || type}>
                          {groupedAccounts[type].map((acc: any) => (
                            <option key={acc.account_id} value={acc.account_id}>
                              {acc.name} (...{acc.mask})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  
                  {/* Spend Graph */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-6">Daily Spend (Last 30 Days)</h3>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                          <XAxis 
                            dataKey="date" 
                            tick={{fontSize: 12, fill: '#64748b'}} 
                            axisLine={false} 
                            tickLine={false}
                            minTickGap={20}
                          />
                          <YAxis 
                            tickFormatter={(value) => `$${value}`} 
                            tick={{fontSize: 12, fill: '#64748b'}} 
                            axisLine={false} 
                            tickLine={false}
                          />
                          <Tooltip 
                            formatter={(value: number) => [value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }), 'Spend']}
                            labelStyle={{ color: '#0f172a', fontWeight: 'bold' }}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                          />
                          <Bar dataKey="spend" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  
                  {/* Transaction List */}
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mt-6">
                    <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="font-semibold text-lg text-slate-900">Recent Transactions</h3>
                    </div>
                    <ul className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                      {filteredTransactions.length === 0 ? (
                        <li className="p-12 text-center text-slate-500 font-medium">No transactions found for this account.</li>
                      ) : (
                        filteredTransactions.map((t: any) => {
                          const isSpend = t.amount > 0;
                          return (
                            <li key={t.transaction_id} className="p-5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-xl shrink-0 border border-slate-200">
                                  {t.personal_finance_category?.primary === 'FOOD_AND_DRINK' ? '🍔' : 
                                   t.personal_finance_category?.primary === 'TRANSPORTATION' ? '🚗' : 
                                   t.personal_finance_category?.primary === 'TRAVEL' ? '✈️' : '💳'}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900">{t.name}</p>
                                  <p className="text-sm text-slate-500 font-medium mt-0.5">
                                    {t.personal_finance_category?.primary?.replace(/_/g, ' ') || 'UNCATEGORIZED'} 
                                    <span className="mx-2 text-slate-300">•</span> 
                                    {new Date(t.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}
                                  </p>
                                  {selectedAccountId === 'all' && (
                                    <p className="text-xs text-blue-600 mt-1 font-semibold">
                                      {getAccountName(t.account_id)}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className={`font-bold text-lg ${isSpend ? 'text-slate-900' : 'text-green-600'}`}>
                                {isSpend ? '-' : '+'}{Math.abs(t.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                              </div>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {/* --- TAB: ACCOUNTS (Balances) --- */}
              {activeTab === 'accounts' && (
                <div className="space-y-8">
                  <h2 className="text-xl font-bold mb-6">Linked Accounts</h2>
                  
                  {Object.keys(groupedAccounts).map((type) => (
                    <div key={type} className="space-y-4">
                      <div className="flex items-center gap-2 text-slate-700">
                        <Landmark size={20} className="text-blue-600" />
                        <h3 className="text-lg font-bold">{typeLabels[type] || type}</h3>
                        <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full ml-2">
                          {groupedAccounts[type].length}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {groupedAccounts[type].map((acc: any) => {
                          const isLiability = acc.type === 'credit' || acc.type === 'loan';
                          return (
                            <div key={acc.account_id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                              <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-3">
                                  <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
                                    {isLiability ? <CreditCard size={24} /> : <Wallet size={24} />}
                                  </div>
                                  <div>
                                    <h4 className="font-bold text-slate-900 line-clamp-1">{acc.name}</h4>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">{acc.subtype.replace(/_/g, ' ')}</p>
                                  </div>
                                </div>
                                {acc.mask && (
                                  <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                                    •••{acc.mask}
                                  </span>
                                )}
                              </div>
                              
                              <div>
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Current Balance</p>
                                <p className={cn("text-2xl font-black tracking-tight", isLiability ? "text-slate-900" : "text-green-600")}>
                                  {acc.balances.current?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  
                </div>
              )}

            </section>
          </div>
        )}
      </main>
    </div>
  );
}
