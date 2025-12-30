import React, { useState, useEffect, useCallback } from 'react';
import { Account, Transaction, AccountType, ViewMode, RecurringTransaction, StorageAdapter } from './types';
import { INITIAL_ACCOUNTS, MOCK_TRANSACTIONS } from './constants';
import { 
    buildAccountTree, 
    generateId, 
    exportToCSV, 
    serializeTransactionsToCSV, 
    parseTransactionsFromCSV, 
    processDueRecurringTransactions
} from './services/ledgerService';
import { AccountTree } from './components/AccountTree';
import { TransactionForm } from './components/TransactionForm';
import { ExpenseDashboard } from './components/Dashboard'; 
import { NetWorthDashboard } from './components/AssetDashboard';
import { RecurringManager } from './components/RecurringManager';
import { JournalView } from './components/JournalView';
import { ConfirmDialog } from './components/ConfirmDialog';
import { 
    BookOpen, 
    ScrollText, 
    PlusCircle, 
    FileSpreadsheet, 
    Landmark, 
    PieChart, 
    CalendarClock,
    Bell
} from 'lucide-react';

interface AppProps {
    adapter?: StorageAdapter;
}

const App: React.FC<AppProps> = ({ adapter }) => {
  const [view, setView] = useState<ViewMode>('dashboard_expense');
  
  // Data State
  const [accounts, setAccounts] = useState<Account[]>(() => {
    if (adapter) return INITIAL_ACCOUNTS;
    const saved = localStorage.getItem('accounts');
    return saved ? JSON.parse(saved) : INITIAL_ACCOUNTS;
  });
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    if (adapter) return [];
    const saved = localStorage.getItem('transactions');
    return saved ? JSON.parse(saved) : MOCK_TRANSACTIONS;
  });
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>(() => {
    if (adapter) return [];
    const saved = localStorage.getItem('recurring');
    return saved ? JSON.parse(saved) : [];
  });

  const [showTxForm, setShowTxForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // Notification State
  const [toast, setToast] = useState<{ message: string, type: 'info' | 'success' } | null>(null);
  
  // Confirmation State
  const [confirmState, setConfirmState] = useState<{
      isOpen: boolean;
      title: string;
      message: string;
      onConfirm: () => void;
  }>({
      isOpen: false,
      title: '',
      message: '',
      onConfirm: () => {}
  });

  // File System State (Web)
  const [dirHandle, setDirHandle] = useState<any>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Journal View specific state to allow external linking (e.g. from Net Worth Dashboard)
  const [journalFocusId, setJournalFocusId] = useState<string | null>(null);

  // Command Event Listeners
  useEffect(() => {
    const handleNewTx = () => {
        setEditingTransaction(null);
        setShowTxForm(true);
    };

    const handleNewRecurring = () => {
        setView('recurring');
        // Dispatch specific event for RecurringManager after a brief delay to ensure component mount
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('ledger-flow:open-recurring-modal'));
        }, 50);
    };

    window.addEventListener('ledger-flow:new-transaction', handleNewTx);
    window.addEventListener('ledger-flow:new-recurring', handleNewRecurring);

    return () => {
        window.removeEventListener('ledger-flow:new-transaction', handleNewTx);
        window.removeEventListener('ledger-flow:new-recurring', handleNewRecurring);
    };
  }, []);

  // Persistence to LocalStorage (Only if NO adapter)
  useEffect(() => {
    if (!adapter) {
        localStorage.setItem('accounts', JSON.stringify(accounts));
        localStorage.setItem('transactions', JSON.stringify(transactions));
        localStorage.setItem('recurring', JSON.stringify(recurringTransactions));
    }
  }, [accounts, transactions, recurringTransactions, adapter]);

  // Inject Tailwind for Obsidian Environment
  useEffect(() => {
    if (adapter) {
        if (!document.getElementById('tailwind-cdn')) {
            const script = document.createElement('script');
            script.id = 'tailwind-cdn';
            script.src = "https://cdn.tailwindcss.com";
            document.head.appendChild(script);
        }
    }
  }, [adapter]);

  // --- Adapter (Plugin) Loading Logic ---
  
  const loadData = useCallback(async () => {
      if (!adapter) return;
      setIsSyncing(true);
      try {
          if (await adapter.exists('Accounts.json')) {
              const accText = await adapter.read('Accounts.json');
              if (accText) setAccounts(JSON.parse(accText));
          } else {
              await adapter.write('Accounts.json', JSON.stringify(INITIAL_ACCOUNTS, null, 2));
          }

          if (await adapter.exists('Transaction.csv')) {
              const txText = await adapter.read('Transaction.csv');
              if (txText) setTransactions(parseTransactionsFromCSV(txText));
          }

          if (await adapter.exists('Recurring.json')) {
              const recText = await adapter.read('Recurring.json');
              if (recText) setRecurringTransactions(JSON.parse(recText));
          }
          setLastSyncTime(new Date().toLocaleTimeString());
      } catch (e) {
          console.error("Failed to load data from vault:", e);
      } finally {
          setIsSyncing(false);
      }
  }, [adapter]);

  useEffect(() => {
    loadData();

    // Listen for external updates (e.g. from the New Transaction Modal via Command Palette)
    const handleRefresh = () => {
        loadData();
    };
    window.addEventListener('ledger-flow:data-changed', handleRefresh);
    return () => window.removeEventListener('ledger-flow:data-changed', handleRefresh);
  }, [loadData]);

  // Recurring Transactions Check
  useEffect(() => {
      if (recurringTransactions.length > 0) {
          const { newTransactions, updatedRecurring } = processDueRecurringTransactions(recurringTransactions, transactions);
          
          if (newTransactions.length > 0) {
              setTransactions(prev => [...newTransactions, ...prev]);
              setRecurringTransactions(updatedRecurring);
              setToast({ message: `Generated ${newTransactions.length} recurring transaction(s) due today.`, type: 'info' });
              
              if (adapter) {
                  saveToDiskInternal([...newTransactions, ...transactions], updatedRecurring, accounts);
              }
          }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurringTransactions.length, adapter]);

  // Toast Auto-Dismiss
  useEffect(() => {
      if (toast) {
          const timer = setTimeout(() => setToast(null), 4000);
          return () => clearTimeout(timer);
      }
  }, [toast]);

  // --- Persistence Logic ---

  const saveToDiskInternal = async (
      txs: Transaction[], 
      recs: RecurringTransaction[], 
      accs: Account[]
  ) => {
      setIsSyncing(true);
      try {
          if (adapter) {
            await adapter.write('Accounts.json', JSON.stringify(accs, null, 2));
            await adapter.write('Transaction.csv', serializeTransactionsToCSV(txs));
            await adapter.write('Recurring.json', JSON.stringify(recs, null, 2));
          } else if (dirHandle) {
             const accFileHandle = await dirHandle.getFileHandle('Accounts.json', { create: true });
             const accWritable = await accFileHandle.createWritable();
             await accWritable.write(JSON.stringify(accs, null, 2));
             await accWritable.close();

             const txFileHandle = await dirHandle.getFileHandle('Transaction.csv', { create: true });
             const txWritable = await txFileHandle.createWritable();
             await txWritable.write(serializeTransactionsToCSV(txs));
             await txWritable.close();

             const recFileHandle = await dirHandle.getFileHandle('Recurring.json', { create: true });
             const recWritable = await recFileHandle.createWritable();
             await recWritable.write(JSON.stringify(recs, null, 2));
             await recWritable.close();
          }
          setLastSyncTime(new Date().toLocaleTimeString());
      } catch (err) {
          console.error("Failed to save:", err);
      } finally {
          setIsSyncing(false);
      }
  };

  const triggerSave = useCallback(() => {
      saveToDiskInternal(transactions, recurringTransactions, accounts);
  }, [transactions, recurringTransactions, accounts, adapter, dirHandle]);

  const connectFolder = async () => {
      try {
          if (!('showDirectoryPicker' in window)) {
              alert("Your browser does not support the File System Access API.");
              return;
          }
          const handle = await (window as any).showDirectoryPicker();
          setDirHandle(handle);
      } catch (err) { console.log(err); }
  };

  // --- Handlers ---

  const treeRoots = buildAccountTree(accounts);

  const handleAddAccount = (parentId: string, name: string, type: AccountType, budget: number) => {
    const newAccount: Account = {
      id: generateId(),
      parentId,
      name,
      type,
      budget
    };
    const updatedAccounts = [...accounts, newAccount];
    setAccounts(updatedAccounts);
    saveToDiskInternal(transactions, recurringTransactions, updatedAccounts);
  };

  const handleUpdateAccount = (accountId: string, newName: string, newBudget: number) => {
    const updatedAccounts = accounts.map(acc => 
      acc.id === accountId ? { ...acc, name: newName, budget: newBudget } : acc
    );
    setAccounts(updatedAccounts);
    saveToDiskInternal(transactions, recurringTransactions, updatedAccounts);
  };

  const handleSaveTransaction = (tx: Transaction) => {
    let updatedTransactions;
    if (editingTransaction) {
        updatedTransactions = transactions.map(t => t.id === tx.id ? tx : t);
    } else {
        updatedTransactions = [tx, ...transactions];
    }
    setTransactions(updatedTransactions);
    setShowTxForm(false);
    setEditingTransaction(null);
    saveToDiskInternal(updatedTransactions, recurringTransactions, accounts);
  };

  const handleEditTransaction = (tx: Transaction) => {
      setEditingTransaction(tx);
      setShowTxForm(true);
  };

  const handleDeleteTransaction = (id: string) => {
    setConfirmState({
        isOpen: true,
        title: 'Delete Transaction',
        message: 'Are you sure you want to delete this transaction? This action cannot be undone.',
        onConfirm: () => {
            const updatedTransactions = transactions.filter(t => t.id !== id);
            setTransactions(updatedTransactions);
            saveToDiskInternal(updatedTransactions, recurringTransactions, accounts);
            setConfirmState(prev => ({ ...prev, isOpen: false }));
            setToast({ message: 'Transaction deleted', type: 'info' });
        }
    });
  };

  const handleAddRecurring = (rt: RecurringTransaction) => {
      const updated = [...recurringTransactions, rt];
      setRecurringTransactions(updated);
      saveToDiskInternal(transactions, updated, accounts);
  };

  const handleUpdateRecurring = (rt: RecurringTransaction) => {
      const updated = recurringTransactions.map(r => r.id === rt.id ? rt : r);
      setRecurringTransactions(updated);
      saveToDiskInternal(transactions, updated, accounts);
  };

  const handleDeleteRecurring = (id: string) => {
      setConfirmState({
        isOpen: true,
        title: 'Delete Recurring Rule',
        message: 'Are you sure you want to delete this recurring rule? Future transactions will not be generated.',
        onConfirm: () => {
            const updated = recurringTransactions.filter(rt => rt.id !== id);
            setRecurringTransactions(updated);
            saveToDiskInternal(transactions, updated, accounts);
            setConfirmState(prev => ({ ...prev, isOpen: false }));
            setToast({ message: 'Recurring rule deleted', type: 'info' });
        }
      });
  };

  const handleToggleRecurring = (id: string) => {
      const updated = recurringTransactions.map(rt => 
        rt.id === id ? { ...rt, active: !rt.active } : rt
      );
      setRecurringTransactions(updated);
      saveToDiskInternal(transactions, updated, accounts);
  };

  const handleExport = () => {
    const csv = exportToCSV(transactions, accounts);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // --- NAVIGATION HELPERS ---
  const handleViewJournalForAccount = (accountId: string) => {
      setJournalFocusId(accountId);
      setView('journal');
  };

  return (
    <div className="flex h-screen bg-slate-100 text-slate-800 font-sans relative">
      {/* Toast Notification */}
      {toast && (
        <div className="absolute top-6 right-6 z-[60] animate-in slide-in-from-top-2 fade-in duration-300">
            <div className="bg-slate-800 text-white px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 border border-slate-700">
                <div className="bg-blue-600 rounded-full p-1">
                    <Bell size={14} className="text-white"/>
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-semibold">Ledger Update</span>
                    <span className="text-xs text-slate-300">{toast.message}</span>
                </div>
                <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-white">
                    <span className="sr-only">Close</span>
                    ×
                </button>
            </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog 
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6">
          <h1 className="text-xl font-bold text-blue-700 flex items-center gap-2">
            <BookOpen className="text-blue-600" />
            LedgerFlow
          </h1>
          <p className="text-xs text-slate-400 mt-1">Double-Entry Personal Finance</p>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {/* Dashboards */}
          <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Dashboards</div>
          <button onClick={() => setView('dashboard_expense')} className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors text-sm font-medium ${view === 'dashboard_expense' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
            <div className="w-5 flex justify-start"><PieChart size={18} /></div>
            <span>Expense Dashboard</span>
          </button>
          <button onClick={() => setView('dashboard_networth')} className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors text-sm font-medium ${view === 'dashboard_networth' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
            <div className="w-5 flex justify-start"><Landmark size={18} /></div>
            <span>Net Worth Dashboard</span>
          </button>

          {/* Records */}
          <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Records</div>
          <button onClick={() => setView('ledger')} className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors text-sm font-medium ${view === 'ledger' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
            <div className="w-5 flex justify-start"><BookOpen size={18} /></div>
            <span>Chart of Accounts</span>
          </button>
          <button onClick={() => setView('journal')} className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors text-sm font-medium ${view === 'journal' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
            <div className="w-5 flex justify-start"><ScrollText size={18} /></div>
            <span>Journal Entries</span>
          </button>
          <button onClick={() => setView('recurring')} className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors text-sm font-medium ${view === 'recurring' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
            <div className="w-5 flex justify-start"><CalendarClock size={18} /></div>
            <span>Recurring</span>
          </button>
        </nav>
        
        {/* Footer actions */}
        <div className="p-4 border-t border-slate-100 space-y-2 bg-slate-50/50">
          <button onClick={handleExport} className="flex items-center justify-center gap-2 w-full px-4 py-2 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 rounded border border-slate-200 shadow-sm">
            <FileSpreadsheet size={14} /> Export View CSV
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm z-10 shrink-0">
          <h2 className="text-lg font-semibold text-slate-700 capitalize">
            {view === 'dashboard_expense' && 'Expense Dashboard'}
            {view === 'dashboard_networth' && 'Net Worth Dashboard'}
            {view === 'ledger' && 'Chart of Accounts'}
            {view === 'journal' && 'General Journal'}
            {view === 'recurring' && 'Recurring Rules'}
          </h2>
          <button onClick={() => { setEditingTransaction(null); setShowTxForm(true); }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full shadow-sm transition-transform hover:scale-105 active:scale-95 text-sm font-bold">
            <PlusCircle size={18} /> New Transaction
          </button>
        </header>

        {/* Content Wrapper - Conditionals for Full Screen Journal */}
        <div className={`flex-1 relative flex flex-col ${view === 'journal' ? 'bg-white overflow-hidden' : 'overflow-y-auto p-8'}`}>
          {showTxForm && (
            <div className="absolute inset-0 z-[60] bg-slate-900/20 backdrop-blur-sm flex items-start justify-center pt-20">
                <div className="w-full max-w-2xl animate-in fade-in zoom-in duration-200">
                    <TransactionForm 
                        accounts={accounts} 
                        transactions={transactions}
                        initialData={editingTransaction}
                        onSave={handleSaveTransaction} 
                        onCancel={() => { setShowTxForm(false); setEditingTransaction(null); }} 
                    />
                </div>
            </div>
          )}

          <div className={`mx-auto w-full transition-all duration-300 ${view === 'journal' ? 'h-full flex flex-col' : 'max-w-5xl'}`}>
            {view === 'dashboard_expense' && <ExpenseDashboard accounts={accounts} transactions={transactions} />}
            {view === 'dashboard_networth' && <NetWorthDashboard accounts={accounts} transactions={transactions} onViewJournal={handleViewJournalForAccount} />}
            {view === 'recurring' && (
                <RecurringManager 
                    accounts={accounts}
                    transactions={transactions}
                    recurringTransactions={recurringTransactions}
                    onAdd={handleAddRecurring}
                    onUpdate={handleUpdateRecurring}
                    onDelete={handleDeleteRecurring}
                    onToggle={handleToggleRecurring}
                />
            )}
            {view === 'ledger' && (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 min-h-[500px] flex flex-col">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-bold text-slate-700">Chart of Accounts</h3>
                        <p className="text-xs text-slate-500">Manage your account structure. Click '+' to add sub-accounts.</p>
                    </div>
                    <div className="p-4 flex-1">
                        <AccountTree accounts={treeRoots} onAddAccount={handleAddAccount} onUpdateAccount={handleUpdateAccount} />
                    </div>
                </div>
            )}
            
            {/* FULL SCREEN JOURNAL VIEW */}
            {view === 'journal' && (
               <JournalView 
                    transactions={transactions}
                    accounts={accounts}
                    focusedAccountId={journalFocusId}
                    onClearFocus={() => setJournalFocusId(null)}
                    onEditTransaction={handleEditTransaction}
                    onDeleteTransaction={handleDeleteTransaction}
               />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;