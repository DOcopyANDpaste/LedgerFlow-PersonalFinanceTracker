import { App, Modal } from 'obsidian';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { TransactionForm } from '../components/TransactionForm';
import { Account, Transaction } from '../types';

export class NewTransactionModal extends Modal {
  private root: ReactDOM.Root | null = null;

  constructor(
    app: App,
    private accounts: Account[],
    private transactions: Transaction[],
    private onSave: (transaction: Transaction) => void
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    
    // Clean up modal styling to fit the form
    this.modalEl.addClass('ledger-flow-modal');
    // Remove default padding to let the React component handle layout
    contentEl.style.padding = '0'; 

    this.root = ReactDOM.createRoot(contentEl);
    this.root.render(
      <React.StrictMode>
        <div className="p-2">
            <TransactionForm 
                accounts={this.accounts} 
                transactions={this.transactions}
                onSave={(tx) => {
                    this.onSave(tx);
                    this.close();
                }}
                onCancel={() => this.close()}
            />
        </div>
      </React.StrictMode>
    );
  }

  onClose() {
    if (this.root) {
      this.root.unmount();
    }
    const { contentEl } = this;
    contentEl.empty();
  }
}