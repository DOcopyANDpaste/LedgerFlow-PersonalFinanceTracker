import { Plugin, WorkspaceLeaf, PluginSettingTab, App, Setting, Notice } from 'obsidian';
import { LedgerFlowView, VIEW_TYPE_LEDGER } from './view';
import { NewTransactionModal } from './modals/NewTransactionModal';
import { ObsidianVaultAdapter } from './adapter';
import { INITIAL_ACCOUNTS } from './constants';
import { parseTransactionsFromCSV, serializeTransactionsToCSV } from './services/ledgerService';

interface LedgerFlowSettings {
	ledgerFolder: string;
}

const DEFAULT_SETTINGS: LedgerFlowSettings = {
	ledgerFolder: 'LedgerFlow'
}

export default class LedgerFlowPlugin extends Plugin {
  settings: LedgerFlowSettings;

  async onload() {
    await this.loadSettings();

    // Register the View
    this.registerView(
      VIEW_TYPE_LEDGER,
      (leaf: WorkspaceLeaf) => new LedgerFlowView(leaf, this.settings.ledgerFolder)
    );

    // Add Ribbon Icon
    this.addRibbonIcon('landmark', 'Open LedgerFlow', () => {
      this.activateView();
    });

    // Add Settings Tab
    this.addSettingTab(new LedgerFlowSettingTab(this.app, this));

    // Add Command: Open Ledger
    this.addCommand({
      id: 'open-ledger-flow',
      name: 'Open Ledger',
      callback: () => {
        this.activateView();
      },
    });

    // Add Command: New Transaction (Via Modal)
    this.addCommand({
        id: 'new-transaction',
        name: 'New Transaction',
        callback: async () => {
            const adapter = new ObsidianVaultAdapter(this.app.vault, this.settings.ledgerFolder);
            
            // 1. Load necessary data for the form
            let accounts = INITIAL_ACCOUNTS;
            if (await adapter.exists('Accounts.json')) {
                const accText = await adapter.read('Accounts.json');
                if (accText) accounts = JSON.parse(accText);
            }

            let transactions: any[] = [];
            if (await adapter.exists('Transaction.csv')) {
                const txText = await adapter.read('Transaction.csv');
                if (txText) transactions = parseTransactionsFromCSV(txText);
            }

            // 2. Open Modal
            new NewTransactionModal(this.app, accounts, transactions, async (newTx) => {
                try {
                    // 3. Save Logic
                    const updatedTransactions = [newTx, ...transactions];
                    const csvContent = serializeTransactionsToCSV(updatedTransactions);
                    await adapter.write('Transaction.csv', csvContent);
                    
                    new Notice('Transaction saved!');

                    // 4. Notify open view to refresh
                    window.dispatchEvent(new CustomEvent('ledger-flow:data-changed'));

                } catch (e) {
                    new Notice('Error saving transaction: ' + e);
                    console.error(e);
                }
            }).open();
        }
    });

    // Add Command: New Recurring Transaction
    this.addCommand({
        id: 'new-recurring-transaction',
        name: 'New Recurring Transaction',
        callback: async () => {
            await this.activateView();
            // Dispatch event to allow the React App to switch view and open modal
            // Slight delay to ensure view is mounted/focused
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('ledger-flow:new-recurring'));
            }, 200);
        }
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_LEDGER);

    if (leaves.length > 0) {
      // A leaf with our view already exists, use that
      leaf = leaves[0];
    } else {
      // Our view could not be found in the workspace, create a new leaf
      leaf = workspace.getLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE_LEDGER, active: true });
    }

    if (leaf) {
        workspace.revealLeaf(leaf);
    }
  }
}

class LedgerFlowSettingTab extends PluginSettingTab {
	plugin: LedgerFlowPlugin;

	constructor(app: App, plugin: LedgerFlowPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl('h2', {text: 'LedgerFlow Settings'});

		new Setting(containerEl)
			.setName('Ledger Data Folder')
			.setDesc('The folder where LedgerFlow saves your financial data (Accounts.json, Transaction.csv, Recurring.json).')
			.addText(text => text
				.setPlaceholder('LedgerFlow')
				.setValue(this.plugin.settings.ledgerFolder)
				.onChange(async (value) => {
					this.plugin.settings.ledgerFolder = value;
					await this.plugin.saveSettings();
				}));
	}
}