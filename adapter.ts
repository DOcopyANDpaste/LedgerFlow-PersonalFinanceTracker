import { Vault, normalizePath } from 'obsidian';
import { StorageAdapter } from './types';

export class ObsidianVaultAdapter implements StorageAdapter {
    constructor(private vault: Vault, private basePath: string) {}

    private getPath(filename: string): string {
        return normalizePath(`${this.basePath}/${filename}`);
    }

    async read(filename: string): Promise<string | null> {
        const path = this.getPath(filename);
        // Use adapter.exists/read to bypass potential cache delays in getAbstractFileByPath
        if (await this.vault.adapter.exists(path)) {
            return await this.vault.adapter.read(path);
        }
        return null;
    }

    async write(filename: string, content: string): Promise<void> {
        const path = this.getPath(filename);
        
        // Ensure folder exists
        const folderPath = normalizePath(this.basePath);
        
        // Check if folder exists in cache, if not try to create
        // We use getAbstractFileByPath for folder check as createFolder works on the abstract tree
        const folder = this.vault.getAbstractFileByPath(folderPath);
        
        if (!folder) {
            try {
                await this.vault.createFolder(folderPath);
            } catch (e: any) {
                // Ignore "Folder already exists" error
                if (e.message && e.message.includes('Folder already exists')) {
                    // pass
                } else {
                    console.error("Error creating folder:", e);
                    throw e;
                }
            }
        }

        const fileExists = await this.vault.adapter.exists(path);
        if (fileExists) {
            // If file exists, use adapter.write which overwrites
            await this.vault.adapter.write(path, content);
        } else {
            // If file doesn't exist, use vault.create which creates a new TFile
            await this.vault.create(path, content);
        }
    }

    async exists(filename: string): Promise<boolean> {
        return await this.vault.adapter.exists(this.getPath(filename));
    }
}