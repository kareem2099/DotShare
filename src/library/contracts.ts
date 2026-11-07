import type { DraftView } from '../agent/drafts';
import type { TemplateView } from '../agent/templates';

export type { DraftView, TemplateView };
export const LIBRARY_TOOLS = [
    'list_accounts', 'create_draft', 'get_draft', 'list_drafts', 'update_draft', 'preview_draft', 'publish_draft',
    'list_templates', 'get_template', 'save_template', 'delete_template', 'render_template', 'create_draft_from_template',
    'get_draft_variants', 'set_draft_variant', 'get_operation',
] as const;
export type LibraryTool = typeof LIBRARY_TOOLS[number];
export interface LibraryAccount { id: string; name: string; platform: string; }
export interface DraftSummary { id: string; title: string; revision: number; status: DraftView['status']; updatedAt: string; accountIds: string[]; }
export interface TemplateSummary { id: string; name: string; description: string; revision: number; builtIn: boolean; parameters: TemplateView['parameters']; }
export interface LibraryConnection { home: string; config: string; tools: string[]; }
export interface ToolOutput<T = unknown> { success: boolean; data?: T; error?: string; }
export interface LibrarySnapshot { connection: LibraryConnection; accounts: LibraryAccount[]; drafts: DraftSummary[]; templates: TemplateSummary[]; }
export interface DraftVariants { draftId: string; revision: number; variants: {
    accountId: string; platform: string; name: string; source: string; text: string; media: string[];
    posts?: { text: string; media: string[] }[]; characterCounts: number[]; characterLimit: number; limitSource: string;
}[]; warnings: string[]; }
