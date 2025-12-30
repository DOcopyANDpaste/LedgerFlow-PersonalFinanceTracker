import React, { useState, useMemo, useEffect } from 'react';
import { Account, Transaction, AccountType } from '../types';
import { getFlattenedBalances, filterTransactions, getDescendantAccountIds } from '../services/ledgerService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { analyzeFinances } from '../services/geminiService';
import { Sparkles, Loader2, Calendar, BarChart2, Search, Filter, ChevronDown, ChevronRight, ArrowUpCircle, ArrowDownCircle, Wallet, Folder, FileText } from 'lucide-react';

interface ExpenseDashboardProps {
  accounts: Account[];
  transactions: Transaction[];
}

export const ExpenseDashboard: React.FC<ExpenseDashboardProps> = ({ accounts, transactions }) => {
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [loadingAi, setLoadingAi] = useState(false);
  
  // Helper to get local date string YYYY-MM-DD
  const toLocalYMD = (d: Date) => {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Filter States
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // MTD default
    return toLocalYMD(d);
  });
  const [endDate, setEndDate] = useState(() => toLocalYMD(new Date()));
  const [activeRangeBtn, setActiveRangeBtn] = useState<string>('MTD');
  const [payeeFilter, setPayeeFilter] = useState('');

  // State for the drill-down selection
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Get unique payees for autocomplete
  const uniquePayees = useMemo(() => {
    const payees = new Set<string>();
    transactions.forEach(t => {
      if (t.payee) payees.add(t.payee);
    });
    return Array.from(payees).sort();
  }, [transactions]);

  // Helper to set preset ranges
  const setPresetRange = (range: 'MTD' | '1M' | '3M' | '6M' | '1Y') => {
      const now = new Date();
      let start = new Date();
      let end = new Date();
      
      if (range === 'MTD') {
          start.setDate(1);
          end = now;
      } else {
          // For 1M, 3M, 6M, 1Y we use "Previous Full Months" logic
          // End date is the last day of the previous month
          end = new Date(now.getFullYear(), now.getMonth(), 0);
          
          let monthsToSubtract = 1;
          if (range === '3M') monthsToSubtract = 3;
          if (range === '6M') monthsToSubtract = 6;
          if (range === '1Y') monthsToSubtract = 12;
          
          // Start date is 1st of (CurrentMonth - X)
          // e.g. If now is Dec (11), 1M -> Start: Nov 1 (11-1=10), End: Nov 30
          // e.g. If now is Dec (11), 3M -> Start: Sep 1 (11-3=8), End: Nov 30
          start = new Date(now.getFullYear(), now.getMonth() - monthsToSubtract, 1);
      }
      setStartDate(toLocalYMD(start));
      setEndDate(toLocalYMD(end));
      setActiveRangeBtn(range);
  };

  const handleCustomDateChange = (type: 'start' | 'end', val: string) => {
      if (type === 'start') setStartDate(val);
      else setEndDate(val);
      setActiveRangeBtn('');
  };

  // 1. Filter Transactions
  const filteredTransactions = useMemo(() => {
      return filterTransactions(transactions, startDate, endDate, payeeFilter);
  }, [transactions, startDate, endDate, payeeFilter]);

  // 2. Calculate Budget Multiplier
  const budgetMultiplier = useMemo(() => {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      return Math.max(0.1, diffDays / 30);
  }, [startDate, endDate]);

  // 3. Calculate Balances
  const filteredBalances = useMemo(() => {
      return getFlattenedBalances(accounts, filteredTransactions);
  }, [accounts, filteredTransactions]);

  // 4. Calculate Income vs Expense Totals
  const { totalIncome, totalExpense, netSavings } = useMemo(() => {
      const incomeRoots = accounts.filter(a => a.type === AccountType.INCOME && !a.parentId);
      const expenseRoots = accounts.filter(a => a.type === AccountType.EXPENSE && !a.parentId);

      const incomeVal = incomeRoots.reduce((acc, root) => {
          const bal = filteredBalances.find(b => b.id === root.id)?.balance || 0;
          return acc + bal;
      }, 0);

      const expenseVal = expenseRoots.reduce((acc, root) => {
          const bal = filteredBalances.find(b => b.id === root.id)?.balance || 0;
          return acc + bal;
      }, 0);

      return { totalIncome: Math.abs(incomeVal), totalExpense: expenseVal, netSavings: Math.abs(incomeVal) - expenseVal };
  }, [accounts, filteredBalances]);

  // Main Chart Data
  const mainChartData = useMemo(() => {
      const parentId = 'root_expenses';
      const childAccounts = accounts.filter(a => a.parentId === parentId);
      
      return childAccounts.map(acc => {
          const balObj = filteredBalances.find(fb => fb.id === acc.id);
          const hasChildren = accounts.some(a => a.parentId === acc.id);
          return {
              id: acc.id,
              name: acc.name,
              Actual: balObj ? balObj.balance : 0,
              Budget: (acc.budget || 0) * budgetMultiplier,
              hasChildren
          };
      }).filter(d => d.Actual > 0 || d.Budget > 0);
  }, [accounts, filteredBalances, budgetMultiplier]);

  const selectedAccount = accounts.find(a => a.id === selectedCategoryId);

  // Grouping logic for Detail View (Card Layout)
  const subCategoryGroups = useMemo(() => {
      if (!selectedAccount) return [];

      // 1. Prepare Child Groups First (Aggregated)
      const directChildren = accounts.filter(a => a.parentId === selectedAccount.id);
      
      const childGroups = directChildren.map(acc => {
          const descendantIds = getDescendantAccountIds(acc.id, accounts);
          const allIdsInBranch = new Set([acc.id, ...descendantIds]);

          const relevantTxs = filteredTransactions.reduce((accTxs, tx) => {
              const relevantSplits = tx.splits.filter(s => allIdsInBranch.has(s.accountId));
              if (relevantSplits.length > 0) {
                  const totalForTx = relevantSplits.reduce((sum, s) => sum + s.amount, 0);
                  accTxs.push({ ...tx, relevantAmount: totalForTx, _specificAccountId: relevantSplits[0].accountId });
              }
              return accTxs;
          }, [] as (Transaction & { relevantAmount: number, _specificAccountId?: string })[]);

          const totalActual = relevantTxs.reduce((sum, t) => sum + t.relevantAmount, 0);
          
          return {
              account: acc,
              transactions: relevantTxs.sort((a, b) => b.date.localeCompare(a.date)),
              totalActual,
              budget: (acc.budget || 0) * budgetMultiplier,
          };
      }).filter(g => g.totalActual > 0 || g.budget > 0).sort((a, b) => b.totalActual - a.totalActual);

      // 2. Prepare Child Summaries (for Parent Card)
      const childSummaries = childGroups.map(c => ({
          id: c.account.id,
          name: c.account.name,
          total: c.totalActual
      }));

      const childrenTotal = childSummaries.reduce((sum, c) => sum + c.total, 0);

      // 3. Parent Node Group (Direct Transactions)
      const parentGroup = (() => {
        const acc = selectedAccount;
        const relevantTxs = filteredTransactions.reduce((accTxs, tx) => {
            const relevantSplits = tx.splits.filter(s => s.accountId === acc.id);
            if (relevantSplits.length > 0) {
                const totalForTx = relevantSplits.reduce((sum, s) => sum + s.amount, 0);
                accTxs.push({ ...tx, relevantAmount: totalForTx });
            }
            return accTxs;
        }, [] as (Transaction & { relevantAmount: number })[]);

        const directTotal = relevantTxs.reduce((sum, t) => sum + t.relevantAmount, 0);

        return {
            account: acc,
            transactions: relevantTxs.sort((a, b) => b.date.localeCompare(a.date)),
            totalActual: directTotal + childrenTotal, 
            budget: (acc.budget || 0) * budgetMultiplier,
            childSummaries // Attach summaries here
        };
      })();

      const result = [];
      // Show parent group if it has transactions OR budget OR child summaries
      if (parentGroup.totalActual > 0 || parentGroup.budget > 0 || childSummaries.length > 0) {
          result.push(parentGroup);
      }
      return [...result, ...childGroups];
  }, [selectedAccount, accounts, filteredTransactions, budgetMultiplier]);

  const handleAiAnalysis = async () => {
    setLoadingAi(true);
    const context = selectedAccount 
        ? `Analyze spending for the category '${selectedAccount.name}' and its sub-categories.`
        : `Analyze my top-level expense spending patterns from ${startDate} to ${endDate}. Total Income: ${totalIncome}, Total Expense: ${totalExpense}.`;

    const result = await analyzeFinances(filteredTransactions, accounts, context);
    setAiAnalysis(result);
    setLoadingAi(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header Controls */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                Financial Overview
            </h2>
            <div className="flex items-center gap-2 mt-2">
                <div> 
                    <input 
                        type="text" 
                        list="dashboard-payee-suggestions"
                        placeholder="Filter Payee..." 
                        value={payeeFilter}
                        onChange={(e) => setPayeeFilter(e.target.value)}
                        className="pl-2 pr-3 py-1 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-blue-100 outline-none w-40"
                    />
                    <datalist id="dashboard-payee-suggestions">
                        {uniquePayees.map(p => (
                            <option key={p} value={p} />
                        ))}
                    </datalist>
                </div>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-2">
              <div className="flex bg-slate-100 p-1 rounded-md shadow-sm">
                  {(['MTD', '1M', '3M', '6M', '1Y'] as const).map((range) => (
                      <button
                        key={range}
                        onClick={() => setPresetRange(range)}
                        className={`px-3 py-1 text-xs font-bold rounded transition-all ${activeRangeBtn === range ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                          {range}
                      </button>
                  ))}
              </div>
              
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-md px-2 py-1 shadow-sm">
                  <Calendar size={14} className="text-slate-400" />
                  <input 
                    type="date" 
                    value={startDate} 
                    onChange={(e) => handleCustomDateChange('start', e.target.value)}
                    className="text-xs border-none outline-none text-slate-600 font-medium w-28 bg-transparent" 
                  />
                  <span className="text-slate-300">-</span>
                  <input 
                    type="date" 
                    value={endDate} 
                    onChange={(e) => handleCustomDateChange('end', e.target.value)}
                    className="text-xs border-none outline-none text-slate-600 font-medium w-28 bg-transparent" 
                  />
              </div>
          </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                  <p className="text-slate-500 text-xs font-bold uppercase mb-1">Total Income</p>
                  <p className="text-2xl font-bold text-green-600">+${totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
              </div>
              <ArrowUpCircle className="text-green-100" size={40} />
          </div>
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                  <p className="text-slate-500 text-xs font-bold uppercase mb-1">Total Expenses</p>
                  <p className="text-2xl font-bold text-red-600">-${totalExpense.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
              </div>
              <ArrowDownCircle className="text-red-100" size={40} />
          </div>
           <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                  <p className="text-slate-500 text-xs font-bold uppercase mb-1">Net Savings</p>
                  <p className={`text-2xl font-bold ${netSavings >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                      {netSavings >= 0 ? '+' : ''}${netSavings.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </p>
              </div>
              <Wallet className="text-blue-100" size={40} />
          </div>
      </div>

      {/* Main Chart */}
      <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">
                  Budget vs Actual: <span className="text-blue-600">Overview</span>
              </h3>
              <span className="text-xs text-slate-400">Click any bar to view transaction details</span>
          </div>
          
          <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mainChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{fontSize: 11}} interval={0} />
                      <YAxis tick={{fontSize: 12}} />
                      <Tooltip 
                        formatter={(value: number) => `$${value.toFixed(2)}`}
                        cursor={{fill: 'transparent'}}
                      />
                      <Legend />
                      <Bar dataKey="Actual" radius={[4, 4, 0, 0]} name="Actual Spending" style={{ cursor: 'pointer' }}>
                        {mainChartData.map((entry, index) => (
                            <Cell 
                                key={`cell-${index}`} 
                                fill={selectedCategoryId === entry.id ? "#b91c1c" : (entry.hasChildren ? "#ef4444" : "#f87171")} 
                                onClick={() => setSelectedCategoryId(entry.id === selectedCategoryId ? null : entry.id)}
                            />
                        ))}
                      </Bar>
                      <Bar dataKey="Budget" fill="#cbd5e1" radius={[4, 4, 0, 0]} name={`Budget (${budgetMultiplier.toFixed(1)}x)`} />
                  </BarChart>
              </ResponsiveContainer>
          </div>
          {mainChartData.length === 0 && <p className="text-center text-sm text-slate-400 mt-4">No data available for the selected period.</p>}
      </div>

      {/* Detail View: Cards Layout */}
      {selectedCategoryId && (
        <div className="bg-slate-50 p-5 rounded-lg shadow-inner border border-slate-200 animate-in slide-in-from-top-4 duration-300">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Filter size={20} className="text-blue-500"/>
                    Detail View: <span className="text-blue-600">{selectedAccount?.name}</span>
                </h3>
                <button onClick={() => setSelectedCategoryId(null)} className="text-xs text-slate-500 hover:text-red-500">Close Detail</button>
             </div>

             <div className="space-y-4">
                 {subCategoryGroups.length > 0 ? (
                     subCategoryGroups.map(group => {
                         const percent = group.budget > 0 ? Math.min(100, (group.totalActual / group.budget) * 100) : 0;
                         const isOverBudget = group.totalActual > group.budget && group.budget > 0;
                         const isParent = group.account.id === selectedAccount?.id;

                         return (
                            <div key={group.account.id} className={`bg-white border rounded-lg overflow-hidden shadow-sm ${isParent ? 'border-blue-200 ring-1 ring-blue-100' : 'border-slate-200'}`}>
                                {/* Group Header */}
                                <div className={`p-3 border-b flex justify-between items-center ${isParent ? 'bg-blue-50/50 border-blue-100' : 'bg-slate-50 border-slate-100'}`}>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-1 h-8 rounded-full ${isOverBudget ? 'bg-red-500' : 'bg-green-500'}`}></div>
                                        <div>
                                            <h4 className="font-bold text-slate-700">{group.account.name} {isParent && <span className="text-[10px] text-slate-400 font-normal ml-1">(Parent Node)</span>}</h4>
                                            <div className="text-xs text-slate-400">{group.transactions.length} transactions {isParent && (group as any).childSummaries?.length > 0 ? `+ ${(group as any).childSummaries.length} child summaries` : ''}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-slate-800">
                                            ${group.totalActual.toFixed(2)} <span className="text-slate-400 text-xs font-normal">/ ${group.budget.toFixed(2)}</span>
                                        </div>
                                        <div className="w-32 h-1.5 bg-slate-200 rounded-full mt-1 overflow-hidden ml-auto">
                                            <div 
                                                className={`h-full rounded-full ${isOverBudget ? 'bg-red-500' : 'bg-green-500'}`} 
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Transaction List */}
                                <div className="divide-y divide-slate-50">
                                    {group.transactions.map(tx => {
                                        // Check if this specific transaction comes from a sub-account (mainly for Child Groups that aggregate descendants)
                                        const txAccId = (tx as any)._specificAccountId;
                                        const isSubDescendant = txAccId && txAccId !== group.account.id;
                                        const subAccountName = isSubDescendant ? accounts.find(a => a.id === txAccId)?.name : null;

                                        return (
                                        <div key={`${tx.id}-${group.account.id}`} className="p-3 hover:bg-slate-50 flex justify-between items-center text-sm">
                                            <div className="flex items-center gap-4">
                                                <span className="text-slate-400 font-mono text-xs w-20">{tx.date}</span>
                                                <div>
                                                    <div className="font-medium text-slate-700 flex items-center gap-2">
                                                        {tx.payee || 'Unknown Payee'}
                                                        {subAccountName && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 rounded-full">{subAccountName}</span>}
                                                    </div>
                                                    <div className="text-slate-400 text-xs truncate max-w-[200px]">{tx.description}</div>
                                                </div>
                                            </div>
                                            <div className="font-mono font-bold text-slate-700">
                                                ${tx.relevantAmount.toFixed(2)}
                                            </div>
                                        </div>
                                    )})}
                                    
                                    {/* Child Summaries for Parent Node */}
                                    {isParent && (group as any).childSummaries && (group as any).childSummaries.map((summary: any) => (
                                        <div key={`sum-${summary.id}`} className="p-3 hover:bg-slate-50 flex justify-between items-center text-sm bg-slate-50/20">
                                            <div className="flex items-center gap-4">
                                                <span className="text-slate-300 font-mono text-xs w-20 text-right"></span>
                                                <div className="font-medium text-slate-600 flex items-center gap-2">
                                                    <span className="bg-slate-100 text-slate-500 text-[10px] px-1 rounded font-bold">SUM</span>
                                                    {summary.name}
                                                </div>
                                            </div>
                                            <div className="font-mono font-bold text-slate-500">
                                                ${summary.total.toFixed(2)}
                                            </div>
                                        </div>
                                    ))}

                                    {group.transactions.length === 0 && (!isParent || ((group as any).childSummaries || []).length === 0) && (
                                        <div className="p-3 text-center text-xs text-slate-400">No transactions in range</div>
                                    )}
                                </div>
                            </div>
                         );
                     })
                 ) : (
                     <div className="text-center py-12 text-slate-400">
                         No transactions found for this category or its sub-categories in the selected period.
                     </div>
                 )}
             </div>
        </div>
      )}

      {/* AI Analyst Section */}
      <div className="bg-gradient-to-r from-rose-50 to-orange-50 p-6 rounded-lg border border-rose-100 relative overflow-hidden">
        <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                    <Sparkles className="text-rose-600" size={24} />
                    <h3 className="text-xl font-bold text-rose-900">Expense Analysis</h3>
                </div>
                {!aiAnalysis && (
                    <button 
                        onClick={handleAiAnalysis}
                        disabled={loadingAi}
                        className="bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-rose-700 transition flex items-center gap-2 disabled:opacity-50"
                    >
                        {loadingAi ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                        {selectedCategoryId ? 'Analyze Detail View' : 'Analyze Overview'}
                    </button>
                )}
            </div>
            
            {loadingAi && (
                <div className="py-8 text-center text-rose-400 animate-pulse">
                    Reviewing your spending patterns...
                </div>
            )}

            {aiAnalysis && (
                <div className="bg-white/80 p-6 rounded-lg shadow-sm border border-rose-100 prose prose-sm max-w-none text-slate-700">
                     <div dangerouslySetInnerHTML={{ __html: aiAnalysis.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') }} />
                     <button onClick={() => setAiAnalysis('')} className="mt-4 text-xs text-rose-500 hover:text-rose-700 underline">Clear Analysis</button>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};