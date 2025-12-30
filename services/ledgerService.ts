import { Account, AccountType, Transaction, FlattenedAccountBalance, Split, RecurringTransaction, Frequency } from '../types';

// Helper to generate IDs
export const generateId = () => Math.random().toString(36).substr(2, 9);

// Build the tree structure from flat list
export const buildAccountTree = (accounts: Account[]): Account[] => {
  const accountMap = new Map<string, Account>();
  const roots: Account[] = [];

  // Create deep copies to avoid mutating original state references during render
  accounts.forEach(acc => {
    accountMap.set(acc.id, { ...acc, children: [] });
  });

  accounts.forEach(acc => {
    const node = accountMap.get(acc.id);
    if (!node) return;
    
    if (acc.parentId && accountMap.has(acc.parentId)) {
      accountMap.get(acc.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
};

export const getAccountPath = (account: Account, allAccounts: Account[]): string => {
    let path = account.name;
    let current = account;
    // Safety break counter to prevent infinite loops in case of bad data
    let depth = 0;
    while (current.parentId && depth < 20) {
        const parent = allAccounts.find(a => a.id === current.parentId);
        if (parent) {
            path = `${parent.name}:${path}`;
            current = parent;
        } else {
            break;
        }
        depth++;
    }
    return path;
};

// Get all account IDs that are descendants of a specific account (inclusive)
export const getDescendantAccountIds = (rootId: string, allAccounts: Account[]): Set<string> => {
    const result = new Set<string>();
    const stack = [rootId];

    while (stack.length > 0) {
        const currentId = stack.pop()!;
        result.add(currentId);
        
        const children = allAccounts.filter(a => a.parentId === currentId);
        children.forEach(c => stack.push(c.id));
    }
    return result;
};

// Calculate balances for a specific account based on transactions
export const calculateAccountBalance = (accountId: string, transactions: Transaction[]): number => {
  let balance = 0;
  transactions.forEach(tx => {
    tx.splits.forEach(split => {
      if (split.accountId === accountId) {
        balance += split.amount;
      }
    });
  });
  return balance;
};

// Recursive balance calculation (including children)
export const calculateTreeBalance = (account: Account, allAccounts: Account[], transactions: Transaction[]): number => {
  let total = calculateAccountBalance(account.id, transactions);
  
  // Find children
  const children = allAccounts.filter(a => a.parentId === account.id);
  children.forEach(child => {
    total += calculateTreeBalance(child, allAccounts, transactions);
  });
  
  return total;
};

export const getFlattenedBalances = (accounts: Account[], transactions: Transaction[]): FlattenedAccountBalance[] => {
  return accounts.map(acc => ({
    id: acc.id,
    name: acc.name,
    type: acc.type,
    balance: calculateTreeBalance(acc, accounts, transactions),
    budget: acc.budget || 0
  }));
};

export type DateRangeOption = 'MTD' | '1M' | '3M' | '6M' | '1Y';

export const filterTransactionsByDateRange = (transactions: Transaction[], range: DateRangeOption): Transaction[] => {
  const now = new Date();
  // Set to end of day
  now.setHours(23, 59, 59, 999);
  
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  if (range === 'MTD') {
    startDate.setDate(1); // First day of current month
  } else {
    let months = 1;
    if (range === '3M') months = 3;
    if (range === '6M') months = 6;
    if (range === '1Y') months = 12;
    
    // Logic: subtract months from today
    startDate.setMonth(now.getMonth() - months);
  }

  return transactions.filter(tx => {
    const txDate = new Date(tx.date);
    // We'll treat tx.date as valid comparable object
    return txDate >= startDate && txDate <= now;
  });
};

export const filterTransactions = (
  transactions: Transaction[], 
  startDateStr: string, 
  endDateStr: string, 
  payeeFilter?: string
): Transaction[] => {
    const start = new Date(startDateStr);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);
    
    const term = payeeFilter ? payeeFilter.toLowerCase() : '';

    return transactions.filter(tx => {
        const txDate = new Date(tx.date);
        const dateMatch = txDate >= start && txDate <= end;
        const payeeMatch = !term || (tx.payee || '').toLowerCase().includes(term);
        return dateMatch && payeeMatch;
    });
};

// --- DATA PERSISTENCE HELPERS ---

// Convert Transactions to a storage-ready CSV format
export const serializeTransactionsToCSV = (transactions: Transaction[]): string => {
  const header = "Transaction ID,Date,Created At,Payee,Description,Account ID,Amount\n";
  const rows = transactions.flatMap(tx =>
    tx.splits.map(split => {
       // Escape quotes in strings
       const cleanPayee = (tx.payee || '').replace(/"/g, '""');
       const cleanDesc = (tx.description || '').replace(/"/g, '""');
       return `${tx.id},${tx.date},${tx.createdAt},"${cleanPayee}","${cleanDesc}",${split.accountId},${split.amount}`;
    })
  );
  return header + rows.join('\n');
};

// Parse storage CSV back to Transactions
export const parseTransactionsFromCSV = (csvContent: string): Transaction[] => {
  const lines = csvContent.split(/\r?\n/);
  const txMap = new Map<string, Transaction>();

  // Skip header (row 0)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Regex to split by comma while respecting quotes: "val1",val2,"val,3"
    const regex = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g;
    const matches = [];
    let match;
    while ((match = regex.exec(line)) !== null) {
        // match[1] is quoted value, match[2] is unquoted
        let val = match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2];
        matches.push(val);
    }

    if (matches.length < 7) continue;

    // Indexes: 0:ID, 1:Date, 2:CreatedAt, 3:Payee, 4:Desc, 5:AccID, 6:Amount
    // Note: Regex might produce empty strings for start/end, cleaner mapping below:
    
    // Re-implementation of simple parser loop
    const row: string[] = [];
    let inQuote = false;
    let currentVal = '';
    for(let char of line) {
        if(char === '"') {
            inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
            row.push(currentVal);
            currentVal = '';
        } else {
            currentVal += char;
        }
    }
    row.push(currentVal);

    // Clean up quotes from start/end
    const cleanRow = row.map(c => {
        if (c.startsWith('"') && c.endsWith('"')) {
            return c.slice(1, -1).replace(/""/g, '"');
        }
        return c;
    });

    const [id, date, createdAtStr, payee, desc, accId, amountStr] = cleanRow;

    if (!txMap.has(id)) {
        txMap.set(id, {
            id,
            date,
            createdAt: Number(createdAtStr),
            payee,
            description: desc,
            splits: []
        });
    }

    const tx = txMap.get(id)!;
    tx.splits.push({
        accountId: accId,
        amount: Number(amountStr)
    });
  }

  return Array.from(txMap.values()).sort((a, b) => b.createdAt - a.createdAt);
};


// Legacy Export for Google Sheets (Human Readable)
export const exportToCSV = (transactions: Transaction[], accounts: Account[]) => {
  const accountMap = new Map(accounts.map(a => [a.id, a.name]));
  
  // Header
  let csvContent = "Date,Payee,Description,Account,Debit,Credit,Total Amount\n";

  transactions.forEach(tx => {
    tx.splits.forEach(split => {
      const accountName = accountMap.get(split.accountId) || 'Unknown';
      const debit = split.amount > 0 ? split.amount.toFixed(2) : '';
      const credit = split.amount < 0 ? Math.abs(split.amount).toFixed(2) : '';
      
      const payee = `"${(tx.payee || '').replace(/"/g, '""')}"`;
      const desc = `"${(tx.description || '').replace(/"/g, '""')}"`;
      
      csvContent += `${tx.date},${payee},${desc},${accountName},${debit},${credit},${split.amount}\n`;
    });
  });

  return csvContent;
};

// --- RECURRING TRANSACTION LOGIC ---

const addDays = (date: Date, days: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

const addMonths = (date: Date, months: number) => {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
};

const addYears = (date: Date, years: number) => {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() + years);
    return result;
};

export const calculateNextDueDate = (currentDate: string, frequency: Frequency): string => {
    const dateObj = new Date(currentDate);
    let nextDate: Date;

    switch (frequency) {
        case 'daily': nextDate = addDays(dateObj, 1); break;
        case 'weekly': nextDate = addDays(dateObj, 7); break;
        case 'monthly': nextDate = addMonths(dateObj, 1); break;
        case 'yearly': nextDate = addYears(dateObj, 1); break;
        default: nextDate = dateObj;
    }

    return nextDate.toISOString().split('T')[0];
};

export const processDueRecurringTransactions = (
    recurringList: RecurringTransaction[], 
    currentTransactions: Transaction[]
): { newTransactions: Transaction[], updatedRecurring: RecurringTransaction[] } => {
    const today = new Date().toISOString().split('T')[0];
    const newTransactions: Transaction[] = [];
    const updatedRecurring = recurringList.map(item => {
        // Create a copy to modify
        let activeItem = { ...item };
        
        // Check if active and due
        if (activeItem.active && activeItem.nextDueDate <= today) {
            // It is due. Create transaction.
            const newTx: Transaction = {
                id: generateId(),
                date: activeItem.nextDueDate, // Record it on the day it was due
                payee: activeItem.payee,
                description: activeItem.description + ' (Recurring)',
                splits: [...activeItem.splits], // Shallow copy splits
                createdAt: Date.now()
            };
            newTransactions.push(newTx);

            // Update next due date
            activeItem.lastRun = activeItem.nextDueDate;
            activeItem.nextDueDate = calculateNextDueDate(activeItem.nextDueDate, activeItem.frequency);
            
            // Handle edge case: If next due date is STILL in the past (e.g. app wasn't opened for 3 months),
            // should we generate 3 transactions or just one?
            // Current Logic: Just one catch-up per session load to avoid spamming 100 entries if user forgot the app.
            // However, to keep the schedule accurate, we ensure the nextDueDate is advanced.
        }
        return activeItem;
    });

    return { newTransactions, updatedRecurring };
};