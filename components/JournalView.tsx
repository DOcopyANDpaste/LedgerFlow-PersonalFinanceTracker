import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, Account } from '../types';
import { getDescendantAccountIds } from '../services/ledgerService';
import { Search, Filter, ChevronLeft, ChevronRight, X, ArrowUp, ArrowDown, Edit2, Trash2, AlertTriangle } from 'lucide-react';

interface JournalViewProps {
  transactions: Transaction[];
  accounts: Account[];
  focusedAccountId: string | null;
  onClearFocus: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}

export const JournalView: React.FC<JournalViewProps> = ({
  transactions,
  accounts,
  focusedAccountId,
  onClearFocus,
  onEditTransaction,
  onDeleteTransaction
}) => {
  // State
  const [journalSearch, setJournalSearch] = useState('');
  const [journalPayeeFilter, setJournalPayeeFilter] = useState('');
  const [journalMinAmount, setJournalMinAmount] = useState('');
  const [journalMaxAmount, setJournalMaxAmount] = useState('');
  const [journalAccountFilter, setJournalAccountFilter] = useState<string | null>(null);
  
  const [journalSort, setJournalSort] = useState<{ key: keyof Transaction | 'amount', direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
  
  // Default to last 3 months
  const [journalRange, setJournalRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setMonth(end.getMonth() - 3);
    return { 
        start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
        end: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
    };
  });

  // Sync prop focus to internal state
  useEffect(() => {
    if (focusedAccountId) {
        setJournalAccountFilter(focusedAccountId);
    }
  }, [focusedAccountId]);

  // Derived Data
  const uniquePayees = useMemo(() => {
    const payees = new Set<string>();
    transactions.forEach(t => {
      if (t.payee) payees.add(t.payee);
    });
    return Array.from(payees).sort();
  }, [transactions]);

  // Handlers
  const handleJournalSort = (key: keyof Transaction | 'amount') => {
    setJournalSort(prev => ({
        key,
        direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const shiftJournalDate = (direction: 'prev' | 'next') => {
      const currentStart = new Date(journalRange.start);
      const shiftAmount = 3; 
      
      const newStart = new Date(currentStart);
      newStart.setMonth(direction === 'next' ? newStart.getMonth() + shiftAmount : newStart.getMonth() - shiftAmount);
      
      const newEnd = new Date(newStart);
      newEnd.setMonth(newEnd.getMonth() + shiftAmount);

      const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      setJournalRange({
          start: toYMD(newStart),
          end: toYMD(newEnd)
      });
  };

  const resetJournalFilters = () => {
      setJournalSearch('');
      setJournalPayeeFilter('');
      setJournalMinAmount('');
      setJournalMaxAmount('');
      setJournalAccountFilter(null);
      onClearFocus();
      setJournalSort({ key: 'date', direction: 'desc' });
      
      const end = new Date();
      const start = new Date();
      start.setMonth(end.getMonth() - 3);
      const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      
      setJournalRange({ start: toYMD(start), end: toYMD(end) });
  };

  const processedJournalData = useMemo(() => {
      let data = [...transactions];

      // Date Range Filter
      data = data.filter(t => t.date >= journalRange.start && t.date <= journalRange.end);

      // Text Search
      if (journalSearch) {
          const term = journalSearch.toLowerCase();
          data = data.filter(t => (t.description || '').toLowerCase().includes(term));
      }

      // Payee Filter
      if (journalPayeeFilter) {
          data = data.filter(t => t.payee === journalPayeeFilter);
      }

      // Amount Filter
      if (journalMinAmount || journalMaxAmount) {
          const min = journalMinAmount ? parseFloat(journalMinAmount) : -Infinity;
          const max = journalMaxAmount ? parseFloat(journalMaxAmount) : Infinity;
          data = data.filter(t => {
              const positiveSum = t.splits.reduce((sum, s) => s.amount > 0 ? sum + s.amount : sum, 0);
              return positiveSum >= min && positiveSum <= max;
          });
      }

      // Account Filter
      if (journalAccountFilter) {
          const descendantIds = getDescendantAccountIds(journalAccountFilter, accounts);
          data = data.filter(t => t.splits.some(s => descendantIds.has(s.accountId)));
      }

      // Sorting
      data.sort((a, b) => {
          let valA: any = a[journalSort.key as keyof Transaction];
          let valB: any = b[journalSort.key as keyof Transaction];

          if (journalSort.key === 'amount') {
              valA = a.splits.reduce((sum, s) => sum + Math.abs(s.amount), 0);
              valB = b.splits.reduce((sum, s) => sum + Math.abs(s.amount), 0);
          }

          if (typeof valA === 'string') valA = valA.toLowerCase();
          if (typeof valB === 'string') valB = valB.toLowerCase();
          if (!valA) valA = '';
          if (!valB) valB = '';

          if (valA < valB) return journalSort.direction === 'asc' ? -1 : 1;
          if (valA > valB) return journalSort.direction === 'asc' ? 1 : -1;
          return 0;
      });

      return data;
  }, [transactions, journalRange, journalSearch, journalSort, journalAccountFilter, accounts, journalPayeeFilter, journalMinAmount, journalMaxAmount]);

  return (
    <div className="flex flex-col h-full animate-in fade-in bg-white">
        {/* Journal Filter & Toolbar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex flex-col gap-4 shrink-0">
        {/* Top Bar: Date Nav + Clear All */}
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded p-1 shadow-sm">
                    <button onClick={() => shiftJournalDate('prev')} className="p-1 hover:bg-slate-100 rounded text-slate-500">
                        <ChevronLeft size={16} />
                    </button>
                    <div className="text-xs font-medium text-slate-600 px-2 min-w-[150px] text-center">
                        {journalRange.start} <span className="text-slate-300 mx-1">to</span> {journalRange.end}
                    </div>
                    <button onClick={() => shiftJournalDate('next')} className="p-1 hover:bg-slate-100 rounded text-slate-500">
                        <ChevronRight size={16} />
                    </button>
                </div>
                <button 
                    onClick={resetJournalFilters}
                    className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1"
                >
                    <Filter size={12} /> Clear Filters
                </button>
            </div>
            
            {/* ACTIVE ACCOUNT FILTER INDICATOR */}
            {journalAccountFilter && (
                <div className="flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded text-xs font-bold animate-in zoom-in">
                    <span>Viewing: {accounts.find(a => a.id === journalAccountFilter)?.name || 'Account'}</span>
                    <button 
                        onClick={() => { setJournalAccountFilter(null); onClearFocus(); }} 
                        className="hover:bg-blue-200 rounded p-0.5"
                    >
                        <X size={12} />
                    </button>
                </div>
            )}
        </div>

        {/* Filter Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* Description Search */}
                <div>
                <input 
                    type="text" 
                    placeholder="Search Description..."
                    className="w-full pl-2 pr-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-100 outline-none"
                    value={journalSearch}
                    onChange={(e) => setJournalSearch(e.target.value)}
                />
                </div>

                {/* Payee Filter */}
                <div>
                <input 
                    list="journal-payee-list"
                    type="text" 
                    placeholder="Filter Payee..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-100 outline-none"
                    value={journalPayeeFilter}
                    onChange={(e) => setJournalPayeeFilter(e.target.value)}
                />
                <datalist id="journal-payee-list">
                    {uniquePayees.map(p => <option key={p} value={p} />)}
                </datalist>
                </div>

                {/* Amount Min */}
                <div>
                <input 
                    type="number" 
                    placeholder="Min Amount"
                    className="w-full pl-2 pr-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-100 outline-none"
                    value={journalMinAmount}
                    onChange={(e) => setJournalMinAmount(e.target.value)}
                />
                </div>

                {/* Amount Max */}
                <div>
                <input 
                    type="number" 
                    placeholder="Max Amount"
                    className="w-full pl-2 pr-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-100 outline-none"
                    value={journalMaxAmount}
                    onChange={(e) => setJournalMaxAmount(e.target.value)}
                />
                </div>
        </div>
        </div>

        <div className="flex-1 overflow-auto relative">
        <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                    <tr>
                        <th className="p-3 w-28 whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleJournalSort('date')}>
                            <div className="flex items-center gap-1">
                                Date {journalSort.key === 'date' && (journalSort.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}
                            </div>
                        </th>
                        <th className="p-3 w-48 whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleJournalSort('payee')}>
                            <div className="flex items-center gap-1">
                                Payee {journalSort.key === 'payee' && (journalSort.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}
                            </div>
                        </th>
                        <th className="p-3 min-w-[200px] whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleJournalSort('description')}>
                        <div className="flex items-center gap-1">
                                Description {journalSort.key === 'description' && (journalSort.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}
                            </div>
                        </th>
                        <th className="p-3 w-48 whitespace-nowrap">Account</th>
                        <th className="p-3 text-right w-28 whitespace-nowrap">Debit</th>
                        <th className="p-3 text-right w-28 whitespace-nowrap">Credit</th>
                        <th className="p-3 text-right w-28 whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleJournalSort('amount')}>
                        <div className="flex items-center justify-end gap-1">
                            Total {journalSort.key === 'amount' && (journalSort.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}
                        </div>
                        </th>
                        <th className="p-3 text-center w-24 whitespace-nowrap">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {processedJournalData.length === 0 ? (
                    <tr><td colSpan={8} className="p-12 text-center text-slate-400">
                        No transactions found in this date range matching your filters.
                    </td></tr>
                    ) : (
                    processedJournalData.map(tx => {
                        const totalAmount = tx.splits.reduce((sum, s) => sum + s.amount, 0);
                        const isBalanced = Math.abs(totalAmount) < 0.01;
                        return tx.splits.map((split, i) => {
                            const acc = accounts.find(a => a.id === split.accountId);
                            const debit = split.amount > 0 ? split.amount : null;
                            const credit = split.amount < 0 ? Math.abs(split.amount) : null;
                            const isFirstRow = i === 0;
                            return (
                                <tr key={`${tx.id}-${i}`} className={`hover:bg-slate-50/50 ${isFirstRow ? 'border-t-4 border-slate-50' : ''}`}>
                                    <td className="p-3 text-slate-500 whitespace-nowrap align-top">{isFirstRow && tx.date}</td>
                                    <td className="p-3 font-medium text-slate-700 align-top">{isFirstRow && (tx.payee || '-')}</td>
                                    <td className="p-3 text-slate-600 align-top">{isFirstRow && (tx.description || '-')}</td>
                                    <td className="p-3 text-slate-700 align-top whitespace-nowrap">{acc?.name || 'Unknown'}</td>
                                    <td className="p-3 text-right font-mono text-slate-700 align-top">{debit ? debit.toFixed(2) : ''}</td>
                                    <td className="p-3 text-right font-mono text-slate-700 align-top">{credit ? credit.toFixed(2) : ''}</td>
                                    <td className="p-3 text-right font-bold text-slate-800 align-top">{split.amount.toFixed(2)}</td>
                                    {isFirstRow && (
                                        <td className="p-3 text-center align-top" rowSpan={tx.splits.length}>
                                            <div className="flex flex-col items-center gap-2">
                                                <button onClick={() => onEditTransaction(tx)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit2 size={16} /></button>
                                                <button onClick={() => onDeleteTransaction(tx.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={16} /></button>
                                                {!isBalanced && <AlertTriangle size={16} className="text-amber-500 cursor-help" />}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            );
                        });
                    })
                    )}
                </tbody>
        </table>
        </div>
    </div>
  );
};