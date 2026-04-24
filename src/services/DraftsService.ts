import * as vscode from 'vscode';
import { Draft } from '../types';

export class DraftsService {
    private static readonly DRAFTS_KEY = 'dotshare_local_drafts';

    constructor(private readonly globalState: vscode.Memento) {}

    public saveDraft(draft: Omit<Draft, 'id' | 'timestamp'>): Draft {
        const drafts = this.getDrafts();
        const newDraft: Draft = {
            ...draft,
            id: `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString()
        };

        drafts.unshift(newDraft);
        // Keep last 100 drafts
        if (drafts.length > 100) {
            drafts.splice(100);
        }

        this.globalState.update(DraftsService.DRAFTS_KEY, drafts);
        return newDraft;
    }

    public updateDraft(id: string, updates: Partial<Draft>): Draft | undefined {
        const drafts = this.getDrafts();
        const index = drafts.findIndex(d => d.id === id);
        
        if (index !== -1) {
            drafts[index] = { 
                ...drafts[index], 
                ...updates, 
                timestamp: new Date().toISOString() 
            };
            this.globalState.update(DraftsService.DRAFTS_KEY, drafts);
            return drafts[index];
        }
        return undefined;
    }

    public getDrafts(): Draft[] {
        return this.globalState.get<Draft[]>(DraftsService.DRAFTS_KEY, []);
    }

    public getDraft(id: string): Draft | undefined {
        return this.getDrafts().find(d => d.id === id);
    }

    public deleteDraft(id: string): void {
        const drafts = this.getDrafts();
        const filtered = drafts.filter(d => d.id !== id);
        this.globalState.update(DraftsService.DRAFTS_KEY, filtered);
    }

    public clearAllDrafts(): void {
        this.globalState.update(DraftsService.DRAFTS_KEY, []);
    }
}
