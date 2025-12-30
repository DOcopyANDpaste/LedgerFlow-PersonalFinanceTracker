import React, { useState, useEffect, useMemo } from 'react';
import { Account, Transaction, Split, AccountType } from '../types';
import { Plus, Trash2, AlertCircle, Save, CreditCard, ArrowRightLeft, ScrollText, TrendingUp } from 'lucide-react';
import { generateId, getAccountPath } from '../services/ledgerService';

interface TransactionFormProps {
  accounts: Account[];
  transactions: Transaction[];
  initialData?: Transaction | null;
  onSave: (transaction: Transaction) => void;
  onCancel: () => void;
}

type TabMode = 'expense' | 'transfer' | 'journal' | 'income';

// Local interface for form handling to allow flexible inputs (e.g. empty string, '-')
interface FormSplit {
    accountId: string;
    amount: string;
}

export const TransactionForm: React.FC<TransactionFormProps> = ({ accounts, transactions, initialData, onSave, onCancel }) => {
  const [mode, setMode] = useState<TabMode>('expense');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [payee, setPayee] = useState('');
  const [description, setDescription] = useState('');

  // Get unique payees for autocomplete
  const uniquePayees = useMemo(() => {
    const payees = new Set<string>();
    transactions.forEach(t => {
      if (t.payee) payees.add(t.payee);
    });
    return Array.from(payees).sort();
  }, [transactions]);

  // Simple Mode State (Expense, Income, Transfer)
  const [amount, setAmount] = useState<string>(''); // String to handle decimals better
  const [primaryAccountId, setPrimaryAccountId] = useState(''); // Debit side (Expense Category OR Destination)
  const [fundingAccountId, setFundingAccountId] = useState(''); // Credit side (Payment Source OR Origin)

  // Advanced Mode State (Journal)
  // We use FormSplit (string amount) to control inputs without forcing "0" or invalidating "-"
  const [splits, setSplits] = useState<FormSplit[]>([
    { accountId: '', amount: '' },
    { accountId: '', amount: '' }
  ]);

  // Auto-fill Description when Payee changes
  useEffect(() => {
    if (!initialData && payee && !description) {
        // Find most recent transaction with this payee
        const lastTx = transactions
            .filter(t => t.payee === payee)
            .sort((a, b) => b.createdAt - a.createdAt)[0];
        
        if (lastTx && lastTx.description) {
            setDescription(lastTx.description);
        }
    }
  }, [payee, initialData, description, transactions]);

  // Initialize Data if Editing
  useEffect(() => {
    if (initialData) {
        setDate(initialData.date);
        setPayee(initialData.payee || '');
        setDescription(initialData.description || '');

        // Determine Mode based on splits
        const hasTwoSplits = initialData.splits.length === 2;
        const debitSplit = initialData.splits.find(s => s.amount > 0);
        const creditSplit = initialData.splits.find(s => s.amount < 0);

        if (hasTwoSplits && debitSplit && creditSplit) {
            const debitAcc = accounts.find(a => a.id === debitSplit.accountId);
            const creditAcc = accounts.find(a => a.id === creditSplit.accountId);
            
            setAmount(debitSplit.amount.toString());
            setPrimaryAccountId(debitSplit.accountId);
            setFundingAccountId(creditSplit.accountId);

            if (debitAcc?.type === AccountType.EXPENSE) {
                setMode('expense');
            } else if (creditAcc?.type === AccountType.INCOME || creditAcc?.type === AccountType.EQUITY) {
                setMode('income');
            } else if (debitAcc?.type === AccountType.ASSET || debitAcc?.type === AccountType.LIABILITY) {
                if (creditAcc?.type === AccountType.ASSET || creditAcc?.type === AccountType.LIABILITY) {
                    setMode('transfer');
                } else {
                    setMode('journal');
                }
            } else {
                setMode('journal');
            }
        } else {
            // Complex splits -> Journal Mode
            setMode('journal');
            // Convert numbers to strings for the form
            setSplits(initialData.splits.map(s => ({
                accountId: s.accountId, 
                amount: s.amount.toString() 
            })));
        }
    } else {
        // Reset if adding new
        setDate(new Date().toISOString().split('T')[0]);
        setAmount('');
        setPrimaryAccountId('');
        setFundingAccountId('');
        setSplits([{ accountId: '', amount: '' }, { accountId: '', amount: '' }]);
        setMode('expense');
    }
  }, [initialData, accounts]);

  // Reset fields when switching modes (Only if NOT in initial edit load... simplified for now)
  // We want to avoid clearing if the user switches tabs while editing
  useEffect(() => {
     if (!initialData) {
         setAmount('');
         setPrimaryAccountId('');
         setFundingAccountId('');
         setSplits([{ accountId: '', amount: '' }, { accountId: '', amount: '' }]);
     }
  }, [mode, initialData]);

  // Calculations for Advanced Mode
  const total = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const isBalanced = Math.abs(total) < 0.01;

  // Helpers for Dropdowns
  // Pre-calculate and sort accounts with full paths
  const accountOptions = useMemo(() => {
    return accounts.map(acc => ({
        ...acc,
        fullPath: getAccountPath(acc, accounts)
    })).sort((a, b) => a.fullPath.localeCompare(b.fullPath));
  }, [accounts]);
  
  const getDebitOptions = () => {
      if (mode === 'expense') return accountOptions.filter(a => a.type === AccountType.EXPENSE);
      if (mode === 'income') return accountOptions.filter(a => a.type === AccountType.ASSET || a.type === AccountType.LIABILITY);
      if (mode === 'transfer') return accountOptions.filter(a => a.type === AccountType.ASSET || a.type === AccountType.LIABILITY);
      return accountOptions;
  };

  const getCreditOptions = () => {
      // For Income: Source is usually Income or Equity (Opening Balance)
      if (mode === 'income') return accountOptions.filter(a => a.type === AccountType.INCOME || a.type === AccountType.EQUITY);
      // For Expense/Transfer: Source is usually Asset or Liability
      return accountOptions.filter(a => a.type === AccountType.ASSET || a.type === AccountType.LIABILITY);
  };

  const handleSplitChange = (index: number, field: keyof FormSplit, value: string) => {
    const newSplits = [...splits];
    if (field === 'amount') {
      // Allow only numbers, minus sign, and dot
      if (/^[-0-9.]*$/.test(value)) {
          newSplits[index].amount = value;
      }
    } else {
      newSplits[index].accountId = value;
    }
    setSplits(newSplits);
  };

  const addSplit = () => {
    setSplits([...splits, { accountId: '', amount: '' }]);
  };

  const removeSplit = (index: number) => {
    if (splits.length > 2) {
      const newSplits = splits.filter((_, i) => i !== index);
      setSplits(newSplits);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalSplits: Split[] = [];

    if (mode === 'journal') {
        if (!isBalanced) return;
        finalSplits = splits
            .filter(s => s.accountId !== '')
            .map(s => ({
                accountId: s.accountId,
                amount: parseFloat(s.amount) || 0
            }));
    } else {
        const numAmount = Number(amount);
        if (!numAmount || !primaryAccountId || !fundingAccountId) return;
        
        finalSplits = [
            { accountId: primaryAccountId, amount: numAmount },    // Debit
            { accountId: fundingAccountId, amount: -numAmount }    // Credit
        ];
    }

    const newTx: Transaction = {
      id: initialData ? initialData.id : generateId(),
      date,
      payee: payee || undefined,
      description: description || undefined,
      splits: finalSplits,
      createdAt: initialData ? initialData.createdAt : Date.now()
    };
    onSave(newTx);
  };

  const isFormValid = () => {
      // Payee and Description are optional
      if (mode === 'journal') return isBalanced;
      return Number(amount) > 0 && primaryAccountId !== '' && fundingAccountId !== '';
  };

  const getPlaceholder = () => {
    if (mode === 'expense') return "e.g. Weekly Groceries";
    if (mode === 'income') return "e.g. Salary or Opening Balance";
    if (mode === 'transfer') return "e.g. Credit Card Payment";
    return "Transaction Details";
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-slate-800">{initialData ? 'Edit Transaction' : 'New Transaction'}</h3>
        
        {/* Mode Selector Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
                type="button"
                onClick={() => setMode('expense')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'expense' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <CreditCard size={14} /> Expense
            </button>
            <button
                type="button"
                onClick={() => setMode('income')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'income' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <TrendingUp size={14} /> Income
            </button>
            <button
                type="button"
                onClick={() => setMode('transfer')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'transfer' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <ArrowRightLeft size={14} /> Transfer
            </button>
            <button
                type="button"
                onClick={() => setMode('journal')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'journal' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <ScrollText size={14} /> Journal
            </button>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-12 gap-4 mb-4">
          <div className="col-span-3">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Date *</label>
            <input 
              type="date" 
              required
              className="w-full border border-slate-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <div className="col-span-4">
             <label className="block text-xs font-semibold text-slate-500 mb-1">Payee (Optional)</label>
             <input 
                list="payees"
                type="text"
                placeholder="Select or enter payee"
                className="w-full border border-slate-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                value={payee}
                onChange={e => setPayee(e.target.value)}
             />
             <datalist id="payees">
                {uniquePayees.map(p => (
                    <option key={p} value={p} />
                ))}
             </datalist>
          </div>
          <div className="col-span-5">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Description (Optional)</label>
            <input 
              type="text" 
              placeholder={getPlaceholder()}
              className="w-full border border-slate-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
        </div>

        {/* SIMPLE MODES (Expense, Income, Transfer) */}
        {mode !== 'journal' && (
            <div className={`space-y-4 p-4 rounded border ${mode === 'income' ? 'bg-green-50 border-green-100' : 'bg-slate-50 border-slate-200'}`}>
                <div className="mb-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                        Amount *
                    </label>
                    <div> 
                        <input 
                            type="number" 
                            step="0.01" 
                            min="0"
                            placeholder="0.00"
                            className="w-full pl-8 pr-4 py-2.5 text-lg font-bold text-slate-700 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            required
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Debit Field */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                            {mode === 'expense' && 'Debit Account (Category) *'}
                            {mode === 'income' && 'Deposit To (Asset) *'}
                            {mode === 'transfer' && 'To Account (Debit) *'}
                        </label>
                        <select
                            className="w-full border border-slate-300 rounded px-1 py-1 text-sm bg-white focus:ring-2 focus:ring-blue-200 outline-none"
                            value={primaryAccountId}
                            onChange={(e) => setPrimaryAccountId(e.target.value)}
                            required
                        >
                            <option value="">Select Account...</option>
                            {getDebitOptions().map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.fullPath}</option>
                            ))}
                        </select>
                        {amount && <div className="text-xs text-green-600 font-mono mt-1 text-right font-medium">+ {Number(amount).toFixed(2)}</div>}
                    </div>

                    {/* Credit Field */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                            {mode === 'expense' && 'Credit Account (Payment Source) *'}
                            {mode === 'income' && 'Source (Income/Equity) *'}
                            {mode === 'transfer' && 'From Account (Credit) *'}
                        </label>
                        <select
                            className="w-full border border-slate-300 rounded px-1 py-1 text-sm bg-white focus:ring-2 focus:ring-blue-200 outline-none"
                            value={fundingAccountId}
                            onChange={(e) => setFundingAccountId(e.target.value)}
                            required
                        >
                            <option value="">Select Account...</option>
                            {getCreditOptions().map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.fullPath}</option>
                            ))}
                        </select>
                        {amount && <div className="text-xs text-red-500 font-mono mt-1 text-right font-medium">- {Number(amount).toFixed(2)}</div>}
                    </div>
                </div>
            </div>
        )}

        {/* JOURNAL MODE (Advanced) */}
        {mode === 'journal' && (
            <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-semibold text-slate-500">Splits (Double Entry) *</label>
                    <div className={`text-xs font-mono font-bold px-2 py-1 rounded ${isBalanced ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        Imbalance: {total.toFixed(2)}
                    </div>
                </div>
                
                <div className="space-y-2 bg-slate-50 p-3 rounded border border-slate-100">
                    <div className="grid grid-cols-12 gap-2 text-xs text-slate-400 mb-1">
                        <div className="col-span-7">Account</div>
                        <div className="col-span-4">Amount (+ Dr / - Cr)</div>
                        <div className="col-span-1"></div>
                    </div>
                    {splits.map((split, idx) => {
                        const valNum = parseFloat(split.amount);
                        return (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-7">
                                <select 
                                    className="w-full border border-slate-300 rounded px-1 py-1 text-sm bg-white"
                                    value={split.accountId}
                                    onChange={e => handleSplitChange(idx, 'accountId', e.target.value)}
                                    required
                                >
                                    <option value="">Select Account...</option>
                                    {accountOptions.map(acc => (
                                        <option key={acc.id} value={acc.id}>
                                            {acc.fullPath}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="col-span-4">
                                <input 
                                    type="text" 
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    className={`w-full border rounded p-2 text-sm font-mono outline-none focus:ring-1 focus:ring-blue-300 
                                        ${!isNaN(valNum) && valNum < 0 ? 'text-red-600 border-red-200 bg-red-50' : ''} 
                                        ${!isNaN(valNum) && valNum > 0 ? 'text-green-600 border-green-200 bg-green-50' : ''}
                                    `}
                                    value={split.amount}
                                    onChange={e => handleSplitChange(idx, 'amount', e.target.value)}
                                    required
                                />
                            </div>
                            <div className="col-span-1 flex justify-center">
                                 <button type="button" onClick={() => removeSplit(idx)} className="text-slate-400 hover:text-red-500">
                                     <Trash2 size={16} />
                                 </button>
                            </div>
                        </div>
                    )})}
                    <button 
                        type="button" 
                        onClick={addSplit}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-2 font-medium"
                    >
                        <Plus size={14} /> Add Split
                    </button>
                </div>
                {!isBalanced && (
                    <div className="mt-4 flex items-start gap-2 text-xs text-orange-600 bg-orange-50 p-2 rounded">
                        <AlertCircle size={16} className="mt-0.5"/>
                        <div>
                            <p className="font-bold">Entry not balanced.</p>
                            <p>In double-entry accounting, sum of debits and credits must be zero.</p>
                        </div>
                    </div>
                )}
            </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
             <button 
                type="button" 
                onClick={onCancel}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded"
             >
                 Cancel
             </button>
             <button 
                type="submit" 
                disabled={!isFormValid()}
                className={`flex items-center gap-2 px-6 py-2 text-sm font-bold text-white rounded shadow-sm
                    ${!isFormValid() ? 'bg-slate-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}
                `}
             >
                 <Save size={16} /> {initialData ? 'Update Transaction' : 'Record Transaction'}
             </button>
        </div>
      </form>
    </div>
  );
};