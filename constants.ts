import { Account, AccountType } from './types';

export const INITIAL_ACCOUNTS: Account[] = [
  { id: 'root_assets', parentId: null, name: 'Assets', type: AccountType.ASSET },
  { id: 'root_liabilities', parentId: null, name: 'Liabilities', type: AccountType.LIABILITY },
  { id: 'root_income', parentId: null, name: 'Income', type: AccountType.INCOME },
  { id: 'root_expenses', parentId: null, name: 'Expenses', type: AccountType.EXPENSE },
  { id: 'root_equity', parentId: null, name: 'Equity/Starting Balance', type: AccountType.EQUITY },
  
  // Sample Child Nodes based on user request
  { id: 'acc_checking', parentId: 'root_assets', name: 'Checking Account', type: AccountType.ASSET },
  { id: 'acc_food', parentId: 'root_expenses', name: 'Food', type: AccountType.EXPENSE, budget: 500 },
  { id: 'acc_grocery', parentId: 'acc_food', name: 'Grocery', type: AccountType.EXPENSE, budget: 300 },
  { id: 'acc_treat', parentId: 'acc_food', name: 'Treats', type: AccountType.EXPENSE, budget: 100 },
  { id: 'acc_activity', parentId: 'root_expenses', name: 'Activity', type: AccountType.EXPENSE, budget: 200 },
  { id: 'acc_bills', parentId: 'root_expenses', name: 'Bills', type: AccountType.EXPENSE },
  { id: 'acc_transport', parentId: 'root_expenses', name: 'Transportation', type: AccountType.EXPENSE },
];

export const MOCK_TRANSACTIONS = [
  {
    id: 'tx_1',
    date: new Date().toISOString().split('T')[0],
    payee: 'Supermart',
    description: 'Weekly Grocery Run',
    createdAt: Date.now(),
    splits: [
      { accountId: 'acc_checking', amount: -50 }, // Paid 50
      { accountId: 'acc_grocery', amount: 30 },   // 30 for groceries
      { accountId: 'acc_treat', amount: 20 },     // 20 for treats
    ]
  }
];
