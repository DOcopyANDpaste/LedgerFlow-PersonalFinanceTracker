import { ItemView, WorkspaceLeaf } from 'obsidian';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ObsidianVaultAdapter } from './adapter';

export const VIEW_TYPE_LEDGER = 'ledger-flow-view';

export class LedgerFlowView extends ItemView {
  private root: ReactDOM.Root | null = null;
  private ledgerFolderPath: string;

  constructor(leaf: WorkspaceLeaf, ledgerFolderPath: string) {
    super(leaf);
    this.ledgerFolderPath = ledgerFolderPath || 'LedgerFlow';
  }

  getViewType() {
    return VIEW_TYPE_LEDGER;
  }

  getDisplayText() {
    return 'LedgerFlow';
  }

  getIcon() {
    return 'landmark';
  }

  async onOpen() {
    const view = this as any;
    const container = view.contentEl;
    container.empty();
    
    // Create a wrapper div
    const rootEl = container.createDiv();
    rootEl.style.height = '100%';
    rootEl.style.display = 'flex';
    rootEl.style.flexDirection = 'column';

    // Initialize Adapter with configured folder
    const adapter = new ObsidianVaultAdapter(view.app.vault, this.ledgerFolderPath);

    this.root = ReactDOM.createRoot(rootEl);
    this.root.render(
      <React.StrictMode>
        <App adapter={adapter} />
      </React.StrictMode>
    );
  }

  async onClose() {
    if (this.root) {
      this.root.unmount();
    }
  }
}