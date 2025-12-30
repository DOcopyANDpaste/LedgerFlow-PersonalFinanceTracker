import React, { useState, useMemo, useEffect } from 'react';
import { Account, RecurringTransaction, Frequency, AccountType, Split, Transaction } from '../types';
import { CalendarClock, Plus, Trash2, ArrowRight, CheckCircle, XCircle, Edit2, Save, X } from 'lucide-react';
import { generateId, getAccountPath } from '../services/ledgerService';

interface RecurringManagerProps {
    accounts: Account[];
    transactions: Transaction[];
    recurringTransactions: RecurringTransaction[];
    onAdd: (rt: RecurringTransaction) => void;
    onUpdate: (rt: RecurringTransaction) => void;
    onDelete: (id: string) => void;
    onToggle: (id: string) => void;
}

export const RecurringManager: React.FC<RecurringManagerProps> = ({ 
    accounts, 
    transactions,
    recurringTransactions, 
    onAdd, 
    onUpdate,
    onDelete,
    onToggle
}) => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    
    // Form State
    const [payee, setPayee] = useState('');
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [frequency, setFrequency] = useState<Frequency>('monthly');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [fromAccount, setFromAccount] = useState('');
    const [toAccount, setToAccount] = useState('');

    // Listen for external trigger
    useEffect(() => {
        const handleOpenModal = () => {
            resetForm();
            setIsFormOpen(true);
        };
        
        window.addEventListener('ledger-flow:open-recurring-modal', handleOpenModal);
        return () => window.removeEventListener('ledger-flow:open-recurring-modal', handleOpenModal);
    }, []);

    // Get unique payees for autocomplete from history
    const uniquePayees = useMemo(() => {
        const payees = new Set<string>();
        transactions.forEach(t => {
          if (t.payee) payees.add(t.payee);
        });
        return Array.from(payees).sort();
    }, [transactions]);

    // Auto-fill Description when Payee changes
    useEffect(() => {
        if (!editingId && payee && !description) {
            // Find most recent transaction with this payee
            const lastTx = transactions
                .filter(t => t.payee === payee)
                .sort((a, b) => b.createdAt - a.createdAt)[0];
            
            if (lastTx && lastTx.description) {
                setDescription(lastTx.description);
            }
        }
    }, [payee, editingId, description, transactions]);

    const accountOptions = useMemo(() => {
        return accounts.map(acc => ({
            ...acc,
            fullPath: getAccountPath(acc, accounts)
        })).sort((a, b) => a.fullPath.localeCompare(b.fullPath));
    }, [accounts]);

    const resetForm = () => {
        setPayee('');
        setDescription('');
        setAmount('');
        setFromAccount('');
        setToAccount('');
        setFrequency('monthly');
        setStartDate(new Date().toISOString().split('T')[0]);
        setEditingId(null);
        setIsFormOpen(false);
    };

    const handleEdit = (rt: RecurringTransaction) => {
        const debitSplit = rt.splits.find(s => s.amount > 0);
        const creditSplit = rt.splits.find(s => s.amount < 0);
        
        if (debitSplit && creditSplit) {
            setPayee(rt.payee);
            setDescription(rt.description);
            setAmount(Math.abs(debitSplit.amount).toString());
            setToAccount(debitSplit.accountId);
            setFromAccount(creditSplit.accountId);
            setFrequency(rt.frequency);
            setStartDate(rt.nextDueDate);
            setEditingId(rt.id);
            setIsFormOpen(true);
        } else {
            alert("Complex recurring splits cannot be edited in this simple form yet.");
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || !fromAccount || !toAccount) return;

        const val = Number(amount);
        const splits: Split[] = [
            { accountId: toAccount, amount: val },  // Debit (Expense/Asset Increase)
            { accountId: fromAccount, amount: -val } // Credit (Asset Decrease/Income)
        ];

        const ruleData: RecurringTransaction = {
            id: editingId || generateId(),
            payee,
            description,
            frequency,
            nextDueDate: startDate,
            splits,
            active: true
        };

        if (editingId) {
            onUpdate(ruleData);
        } else {
            onAdd(ruleData);
        }
        
        resetForm();
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
             <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <CalendarClock className="text-purple-600"/> Recurring Transactions
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Automate your regular expenses and income. Transactions are generated automatically when due.
                    </p>
                </div>
                {!isFormOpen && (
                    <button 
                        onClick={() => setIsFormOpen(true)}
                        className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition-colors"
                    >
                        <Plus size={18} /> Add Recurring Rule
                    </button>
                )}
            </div>

            {isFormOpen && (
                <div className="bg-purple-50 p-6 rounded-lg border border-purple-100 shadow-inner animate-in slide-in-from-top-4">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-purple-900">
                            {editingId ? 'Edit Recurring Rule' : 'Set up new automation'}
                        </h3>
                        <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                            <X size={20} />
                        </button>
                    </div>
                    <form onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-xs font-bold text-purple-700 mb-1">Payee / Name</label>
                                <input 
                                    type="text" 
                                    list="recurring-payees"
                                    className="w-full p-2 border rounded text-sm" 
                                    value={payee} 
                                    onChange={e => setPayee(e.target.value)} 
                                    placeholder="e.g. Landlord" 
                                    required 
                                />
                                <datalist id="recurring-payees">
                                    {uniquePayees.map(p => (
                                        <option key={p} value={p} />
                                    ))}
                                </datalist>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-purple-700 mb-1">Description</label>
                                <input type="text" className="w-full p-2 border rounded text-sm" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Monthly Rent" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-purple-700 mb-1">Amount</label>
                                <input type="number" step="0.01" className="w-full p-2 border rounded text-sm" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required />
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-purple-700 mb-1">Frequency</label>
                                    <select className="w-full p-2 border rounded text-sm" value={frequency} onChange={e => setFrequency(e.target.value as Frequency)}>
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                        <option value="yearly">Yearly</option>
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-purple-700 mb-1">Next Due Date</label>
                                    <input type="date" className="w-full p-2 border rounded text-sm" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 bg-white p-4 rounded border border-purple-100">
                             <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">From Account (Credit)</label>
                                <select className="w-full p-2 border rounded text-sm" value={fromAccount} onChange={e => setFromAccount(e.target.value)} required>
                                    <option value="">Select Source...</option>
                                    {accountOptions.map(a => <option key={a.id} value={a.id}>{a.fullPath}</option>)}
                                </select>
                             </div>
                             <div className="flex items-center justify-center pt-4 text-purple-300">
                                 <ArrowRight size={24} />
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">To Account (Debit)</label>
                                <select className="w-full p-2 border rounded text-sm" value={toAccount} onChange={e => setToAccount(e.target.value)} required>
                                    <option value="">Select Destination...</option>
                                    {accountOptions.map(a => <option key={a.id} value={a.id}>{a.fullPath}</option>)}
                                </select>
                             </div>
                        </div>

                        <div className="flex justify-end gap-2">
                             <button type="button" onClick={resetForm} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
                             <button type="submit" className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded shadow-sm">
                                <Save size={16} /> {editingId ? 'Update Rule' : 'Save Rule'}
                             </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recurringTransactions.length === 0 && !isFormOpen && (
                    <div className="col-span-full text-center py-12 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                        No recurring transactions set up yet.
                    </div>
                )}
                {recurringTransactions.map(rt => {
                    const amount = Math.abs(rt.splits.find(s => s.amount > 0)?.amount || 0);
                    const toId = rt.splits.find(s => s.amount > 0)?.accountId;
                    const fromId = rt.splits.find(s => s.amount < 0)?.accountId;
                    const toName = accounts.find(a => a.id === toId)?.name || 'Unknown';
                    const fromName = accounts.find(a => a.id === fromId)?.name || 'Unknown';

                    return (
                        <div key={rt.id} className={`bg-white p-4 rounded-lg border shadow-sm relative overflow-hidden group transition-all ${rt.active ? 'border-slate-200' : 'border-slate-100 opacity-70 bg-slate-50'}`}>
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h4 className="font-bold text-slate-800">{rt.payee}</h4>
                                    <p className="text-xs text-slate-500">{rt.description}</p>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-lg text-slate-800">${amount.toFixed(2)}</div>
                                    <div className="text-[10px] font-bold uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded inline-block">{rt.frequency}</div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2 text-xs text-slate-600 mb-3 bg-slate-50 p-2 rounded">
                                <span className="truncate max-w-[45%]">{fromName}</span>
                                <ArrowRight size={12} className="text-slate-400" />
                                <span className="truncate max-w-[45%] font-medium">{toName}</span>
                            </div>

                            <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-50">
                                <div className="text-xs text-slate-400">
                                    Next: <span className={`font-medium ${rt.active ? 'text-blue-600' : 'text-slate-400'}`}>{rt.nextDueDate}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleEdit(rt)}
                                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                        title="Edit"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button 
                                        onClick={() => onToggle(rt.id)}
                                        className={`p-1.5 rounded transition-colors ${rt.active ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-slate-100'}`}
                                        title={rt.active ? "Pause" : "Resume"}
                                    >
                                        {rt.active ? <CheckCircle size={16}/> : <XCircle size={16} />}
                                    </button>
                                    <button 
                                        onClick={() => onDelete(rt.id)}
                                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};