import React, { useState, useMemo } from 'react';
import { Account, Transaction, AccountType } from '../types';
import { getFlattenedBalances, getDescendantAccountIds } from '../services/ledgerService';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Wallet, Landmark, ChevronRight, ChevronDown, FolderOpen, ExternalLink, ArrowRight, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

interface NetWorthDashboardProps {
  accounts: Account[];
  transactions: Transaction[];
  onViewJournal: (accountId: string) => void;
}

// Internal component for the recursive tree sidebar
const AccountTreeNav: React.FC<{
    node: Account;
    allAccounts: Account[];
    selectedId: string;
    onSelect: (id: string) => void;
    balances: { id: string; balance: number }[];
    level?: number;
}> = ({ node, allAccounts, selectedId, onSelect, balances, level = 0 }) => {
    const [expanded, setExpanded] = useState(true);
    const children = allAccounts.filter(a => a.parentId === node.id);
    const hasChildren = children.length > 0;
    const balance = balances.find(b => b.id === node.id)?.balance || 0;

    const isSelected = selectedId === node.id;

    // Liabilities are usually negative balance in logic, but positive for display often. 
    // We stick to raw balance here, presentation layer handles display.
    const displayBalance = node.type === AccountType.LIABILITY ? -balance : balance;

    return (
        <div>
            <div 
                className={`
                    flex items-center justify-between px-2 py-1.5 rounded cursor-pointer text-sm mb-0.5
                    ${isSelected ? 'bg-blue-100 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}
                `}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                onClick={() => onSelect(node.id)}
            >
                <div className="flex items-center gap-1.5 overflow-hidden">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                        className={`p-0.5 hover:bg-black/5 rounded ${!hasChildren ? 'invisible' : ''}`}
                    >
                        {expanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                    </button>
                    <span className="truncate">{node.name}</span>
                </div>
                {/* Tiny indicator of balance in the tree */}
                <span className={`text-xs font-mono opacity-60 ml-2 ${displayBalance < 0 ? 'text-red-500' : ''}`}>
                   ${Math.abs(displayBalance).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
            </div>
            
            {expanded && hasChildren && (
                <div>
                    {children.map(child => (
                        <AccountTreeNav 
                            key={child.id} 
                            node={child} 
                            allAccounts={allAccounts} 
                            selectedId={selectedId}
                            onSelect={onSelect}
                            balances={balances}
                            level={level + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export const NetWorthDashboard: React.FC<NetWorthDashboardProps> = ({ accounts, transactions, onViewJournal }) => {
  // 1. Calculate all balances (Tree-based)
  const balances = useMemo(() => getFlattenedBalances(accounts, transactions), [accounts, transactions]);

  // 2. Identify Roots
  const rootAsset = accounts.find(a => a.type === AccountType.ASSET && a.parentId === null);
  const rootLiability = accounts.find(a => a.type === AccountType.LIABILITY && a.parentId === null);
  
  // 3. Selection State (Default to Root Asset)
  const [selectedAccountId, setSelectedAccountId] = useState<string>(rootAsset?.id || '');

  // Ensure selection is valid
  const currentAccount = accounts.find(a => a.id === selectedAccountId) || rootAsset;
  
  if (!rootAsset || !currentAccount) return <div className="p-8">Please configure an Asset root account.</div>;

  // 4. Data Derivation based on Selection
  
  // A: The total value of the selected branch
  const rawBranchBalance = balances.find(b => b.id === currentAccount.id)?.balance || 0;
  // Invert for display if liability (so debt looks positive "amount owed")
  const displayBranchBalance = currentAccount.type === AccountType.LIABILITY ? -rawBranchBalance : rawBranchBalance;

  // B: Immediate Children (for Pie Chart breakdown)
  const immediateChildren = accounts.filter(a => a.parentId === currentAccount.id);
  const pieData = immediateChildren.map(child => {
      const childBal = balances.find(b => b.id === child.id)?.balance || 0;
      // Normalization for charts: Chart slices must be positive
      return { 
          name: child.name, 
          value: Math.abs(childBal) // Show magnitude
      };
  }).filter(d => d.value > 0);

  // If leaf node selected or empty children, show itself
  if (pieData.length === 0 && Math.abs(rawBranchBalance) > 0) {
      pieData.push({ name: currentAccount.name, value: Math.abs(rawBranchBalance) });
  }

  // C: Transactions for this branch (limit 50)
  const branchTransactions = useMemo(() => {
     // Get set of all ID's in this branch
     const descendantIds = getDescendantAccountIds(currentAccount.id, accounts);
     
     return transactions
        .filter(tx => tx.splits.some(s => descendantIds.has(s.accountId)))
        .sort((a, b) => b.date.localeCompare(a.date)) // Newest first
        .slice(0, 50);
  }, [currentAccount, accounts, transactions]);

  // D: Year-to-Year Net Worth History
  const historicalNetWorth = useMemo(() => {
      const nwAccountIds = new Set(accounts.filter(a => a.type === AccountType.ASSET || a.type === AccountType.LIABILITY).map(a => a.id));
      
      const yearlyChanges = new Map<string, number>();
      let minYear = new Date().getFullYear();
      let maxYear = new Date().getFullYear();

      if (transactions.length > 0) {
          const years = transactions.map(t => new Date(t.date).getFullYear());
          minYear = Math.min(...years);
          maxYear = Math.max(...years);
      } else {
          // If no transactions, at least show current year
          yearlyChanges.set(minYear.toString(), 0);
      }

      // Initialize range
      for(let y = minYear; y <= maxYear; y++) {
          yearlyChanges.set(y.toString(), 0);
      }

      transactions.forEach(tx => {
          const year = new Date(tx.date).getFullYear().toString();
          let change = 0;
          tx.splits.forEach(s => {
              if (nwAccountIds.has(s.accountId)) {
                  change += s.amount;
              }
          });
          if (yearlyChanges.has(year)) {
              yearlyChanges.set(year, yearlyChanges.get(year)! + change);
          }
      });

      const result = [];
      let runningTotal = 0;
      const sortedYears = Array.from(yearlyChanges.keys()).sort();
      
      for (const year of sortedYears) {
          runningTotal += yearlyChanges.get(year) || 0;
          result.push({ year, netWorth: runningTotal });
      }
      
      return result;
  }, [accounts, transactions]);

  // Global Net Worth Stats
  const globalAssets = balances.find(b => b.id === rootAsset.id)?.balance || 0;
  const globalLiabilities = balances.find(b => b.id === rootLiability?.id)?.balance || 0;
  const netWorth = globalAssets + globalLiabilities; // Liab is negative

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1'];

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col gap-4 animate-in fade-in duration-500">
       
       {/* 1. Year Net Worth History (Top) */}
       <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 flex flex-col h-64 shrink-0">
            <h3 className="font-bold text-slate-700 mb-2 shrink-0 text-sm flex items-center gap-2">
                <TrendingUp size={16} className="text-green-600"/>
                Yearly Net Worth History
            </h3>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historicalNetWorth} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="year" tick={{fontSize: 11, fill: '#64748b'}} axisLine={false} tickLine={false} />
                        <YAxis tick={{fontSize: 11, fill: '#64748b'}} axisLine={false} tickLine={false} />
                        <Tooltip 
                        formatter={(value: number) => [`$${value.toLocaleString()}`, 'Net Worth']}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                        />
                        <Line 
                        type="monotone" 
                        dataKey="netWorth" 
                        stroke="#10b981" 
                        strokeWidth={3} 
                        dot={{r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff'}} 
                        activeDot={{r: 6, fill: '#10b981'}} 
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
       </div>

       {/* 2. Global Stats Row */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
           <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                   <div className="text-slate-500 text-xs font-bold uppercase mb-1">Total Assets</div>
                   <div className="text-xl font-bold text-blue-600">${globalAssets.toLocaleString()}</div>
                </div>
                <Wallet className="text-blue-100" />
           </div>
           <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                   <div className="text-slate-500 text-xs font-bold uppercase mb-1">Total Liabilities</div>
                   <div className="text-xl font-bold text-red-600">${Math.abs(globalLiabilities).toLocaleString()}</div>
                </div>
                <TrendingDown className="text-red-100" />
           </div>
           <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                   <div className="text-slate-500 text-xs font-bold uppercase mb-1">Global Net Worth</div>
                   <div className={`text-xl font-bold ${netWorth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                       ${netWorth.toLocaleString()}
                   </div>
                </div>
                <Landmark className="text-slate-300" />
           </div>
       </div>

       {/* 3. Split Content */}
       <div className="flex flex-1 gap-4 min-h-0">
           
           {/* Left Sidebar: Tree (Row span 3 effectively via flex height) */}
           <div className="w-1/3 md:w-64 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col">
               <div className="p-3 border-b border-slate-100 bg-slate-50 font-semibold text-xs text-slate-500 uppercase tracking-wider">
                   Accounts
               </div>
               <div className="flex-1 overflow-y-auto p-2">
                   <div className="text-xs font-bold text-slate-400 uppercase mt-2 mb-1 px-2">Assets</div>
                   <AccountTreeNav 
                        node={rootAsset} 
                        allAccounts={accounts} 
                        selectedId={selectedAccountId} 
                        onSelect={setSelectedAccountId}
                        balances={balances}
                   />
                   
                   {rootLiability && (
                       <>
                        <div className="text-xs font-bold text-slate-400 uppercase mt-4 mb-1 px-2">Liabilities</div>
                        <AccountTreeNav 
                                node={rootLiability} 
                                allAccounts={accounts} 
                                selectedId={selectedAccountId} 
                                onSelect={setSelectedAccountId}
                                balances={balances}
                        />
                       </>
                   )}
               </div>
           </div>

           {/* Right Panel: Grid Layout */}
           <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-[auto_auto_1fr] gap-4 min-h-0 overflow-y-auto lg:overflow-hidden">
                
                {/* Cell 1 (Row 1 Col 1): Current Selection */}
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between lg:col-span-1">
                    <div>
                        <div className="text-blue-600 text-xs font-bold uppercase mb-1">Current Selection</div>
                        <div className="text-xl font-bold text-slate-800">{currentAccount.name}</div>
                        <div className="text-xs text-slate-400">{currentAccount.type}</div>
                    </div>
                    <FolderOpen className="text-blue-100" />
                </div>

                {/* Cell 2 (Row 1-2 Col 2): Breakdown Chart (Spans 2 rows) */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 flex flex-col lg:col-span-1 lg:row-span-2 min-h-[220px]">
                    <h3 className="font-bold text-slate-700 mb-2 shrink-0 text-sm">Breakdown: {currentAccount.name}</h3>
                    <div className="flex-1 min-h-0 relative">
                        {pieData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={70}
                                        fill="#8884d8"
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                                    <Legend 
                                        layout="vertical" 
                                        verticalAlign="middle" 
                                        align="right"
                                        wrapperStyle={{fontSize: '10px'}}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs text-center p-4">
                                No sub-accounts with balances.
                            </div>
                        )}
                    </div>
                </div>

                {/* Cell 3 (Row 2 Col 1): Selection Balance */}
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between lg:col-span-1">
                    <div>
                        <div className="text-slate-600 text-xs font-bold uppercase mb-1">Selection Balance</div>
                        <div className={`text-2xl font-bold ${rawBranchBalance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                            ${displayBranchBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </div>
                    </div>
                    <DollarSign className="text-slate-200" />
                </div>

                {/* Cell 4 (Row 3 Col 1-2): Recent Transactions (Spans full width) */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col lg:col-span-2 min-h-[300px] lg:min-h-0">
                    <div className="p-3 border-b border-slate-100 bg-slate-50 font-semibold text-xs text-slate-500 uppercase flex justify-between items-center">
                        <span>Recent Transactions (Branch)</span>
                        <button 
                            onClick={() => onViewJournal(currentAccount.id)}
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
                        >
                            View in Journal <ExternalLink size={12} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto p-0 relative">
                        <table className="w-full text-sm text-left border-collapse">
                                <thead className="sticky top-0 bg-white shadow-sm z-10">
                                    <tr className="text-xs text-slate-500 border-b border-slate-200">
                                        <th className="p-2 pl-4">Date</th>
                                        <th className="p-2">Payee</th>
                                        <th className="p-2 text-right pr-4">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {branchTransactions.length > 0 ? (
                                        branchTransactions.map(tx => {
                                            const descendantIds = getDescendantAccountIds(currentAccount.id, accounts);
                                            const relevantAmount = tx.splits
                                                .filter(s => descendantIds.has(s.accountId))
                                                .reduce((sum, s) => sum + s.amount, 0);

                                            return (
                                                <tr key={tx.id} className="border-b border-slate-50 hover:bg-slate-50">
                                                    <td className="p-2 pl-4 text-slate-500 whitespace-nowrap">{tx.date}</td>
                                                    <td className="p-2 text-slate-700 font-medium truncate max-w-[150px]">{tx.payee}</td>
                                                    <td className={`p-2 pr-4 text-right font-bold ${relevantAmount > 0 ? 'text-blue-600' : 'text-slate-700'}`}>
                                                        {relevantAmount.toFixed(2)}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={3} className="p-6 text-center text-slate-400">
                                                No transactions found for this branch.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                        </table>
                    </div>
                    {branchTransactions.length === 50 && (
                        <div className="p-2 text-center border-t border-slate-100">
                            <button 
                                    onClick={() => onViewJournal(currentAccount.id)}
                                    className="text-xs text-slate-500 hover:text-blue-600 flex items-center justify-center gap-1 w-full"
                                >
                                Showing last 50. Click to see all <ArrowRight size={10} />
                            </button>
                        </div>
                    )}
                </div>
           </div>
       </div>
    </div>
  );
};