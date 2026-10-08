import { SocialPlatform } from '../types';

export type ReleaseSourceType =
  | 'changelog'
  | 'readme'
  | 'git_commits'
  | 'git_diff'
  | 'manual'
  | 'active_editor'
  | 'dependencies'
  | 'docs_search';

export type PostTone =
  | 'professional'
  | 'casual_build_in_public'
  | 'technical_deep_dive'
  | 'tldr_bulletin'
  | 'full_markdown_article';

export interface RelevantCodeSnippet {
  file: string;
  code: string;
  reason?: string;
  startLine?: number;
  endLine?: number;
  language?: string;
  truncated?: boolean;
}

export type ReleaseContextScope = 'release' | 'working_tree';

export interface ReleaseDocument {
  file: string;
  content: string;
  kind: 'release_notes' | 'architecture' | 'planned';
  truncated?: boolean;
}

export interface ActiveEditorContext {
  fileName: string;
  languageId?: string;
  selectedText?: string;
  cursorLine?: number;
}

export interface ProjectReleaseContext {
  projectName: string;
  projectDescription?: string;
  version?: string;
  changelogNotes?: string[];
  latestCommit?: string;
  recentCommits?: string[];
  gitDiffSummary?: string;
  repoUrl?: string;
  techStack?: string[];
  gitBaseTag?: string;
  gitCommitCount?: number;
  gitDirty?: boolean;
  scope?: ReleaseContextScope;
  releaseTag?: string;
  targetRef?: string;
  targetLabel?: string;
  baseRef?: string;
  availableTags?: string[];
  changedFiles?: string[];
  workingTreeSummary?: string;
  releaseDocuments?: ReleaseDocument[];
  contextWarnings?: string[];

  // Rich Context as Data Search fields
  topicQuery?: string;
  relevantCommits?: string[];
  relevantCodeSnippets?: RelevantCodeSnippet[];
  dependencyChanges?: string[];
  activeEditorContext?: ActiveEditorContext;
  matchingDocNotes?: string[];
}

export interface GenerateContentOptions {
  model: string;
  maxTokens?: number;
}

/**
 * Persistent user CTA link stored in VS Code globalState
 */
export interface UserCtaLink {
  id: string;
  label: string;
  url: string;
  emoji?: string;
}

/**
 * Runtime CTA link passed into ReleaseGenerationRequest
 */
export interface ReleaseCtaLink {
  id: string;
  label: string;
  url: string;
  emoji?: string;
  source: 'saved' | 'repository';
}

export interface ReleaseGenerationRequest {
  context: ProjectReleaseContext;
  targetPlatforms: SocialPlatform[];
  tone: PostTone;
  language: 'en' | 'ar';
  includeHashtags?: boolean;
  includeCodeSnippets?: boolean;
  threadMode?: boolean;
  customPrompt?: string;
  topicQuery?: string;
  includeActiveEditor?: boolean;
  ctaLinks?: ReleaseCtaLink[];
  sources?: ReleaseSourceType[];
  scope?: ReleaseContextScope;
  releaseTag?: string;
}

export interface GeneratedPlatformContent {
  platform: SocialPlatform;
  rawContent: string;
  formattedPreview?: string;
  charCount: number;
  isThread?: boolean;
  threadParts?: string[];
  qualityWarnings?: string[];
  frontmatter?: {
    title?: string;
    published?: boolean;
    tags?: string[];
    description?: string;
    cover_image?: string;
    canonical_url?: string;
    [key: string]: unknown;
  };
}
