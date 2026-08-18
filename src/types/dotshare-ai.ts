import { SocialPlatform } from '../types';

export type ReleaseSourceType = 'changelog' | 'readme' | 'git_commits' | 'git_diff' | 'manual';

export type PostTone = 
  | 'professional'
  | 'casual_build_in_public'
  | 'technical_deep_dive'
  | 'tldr_bulletin'
  | 'full_markdown_article';

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
  ctaLinks?: ReleaseCtaLink[];
}

export interface GeneratedPlatformContent {
  platform: SocialPlatform;
  rawContent: string;
  formattedPreview?: string;
  charCount: number;
  isThread?: boolean;
  threadParts?: string[];
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
