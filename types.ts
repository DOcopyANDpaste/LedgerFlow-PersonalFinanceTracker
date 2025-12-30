
export enum AccountType {
  ASSET = 'Asset',
  LIABILITY = 'Liability',
  INCOME = 'Income',
  EXPENSE = 'Expense',
  EQUITY = 'Equity'
}

export interface Account {
  id: string;
  parentId: string | null;
  name: string;
  type: AccountType;
  budget?: number; // Monthly budget target
  description?: string;
  children?: Account[]; // For tree traversal
}

export interface Split {
  accountId: string;
  amount: number; // Positive for Debit, Negative for Credit usually
}

export interface Transaction {
  id: string;
  date: string;
  payee?: string;
  description?: string;
  splits: Split[];
  createdAt: number;
}

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurringTransaction {
  id: string;
  frequency: Frequency;
  nextDueDate: string; // YYYY-MM-DD
  payee: string;
  description: string;
  splits: Split[];
  lastRun?: string;
  active: boolean;
}

export interface FlattenedAccountBalance {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  budget: number;
}

export type ViewMode = 'dashboard_expense' | 'dashboard_networth' | 'journal' | 'ledger' | 'analysis' | 'recurring';

export interface StorageAdapter {
  read(filename: string): Promise<string | null>;
  write(filename: string, content: string): Promise<void>;
  exists(filename: string): Promise<boolean>;
}