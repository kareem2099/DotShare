import { SocialPlatform } from '../../types';
import { ReleaseGenerationRequest, PostTone, ProjectReleaseContext } from '../../types/dotshare-ai';

export class ReleasePromptBuilder {
    /**
     * Builds a tailored prompt for a given platform and tone
     */
    public static buildPrompt(request: ReleaseGenerationRequest, platform: SocialPlatform): string {
        const { context, tone, language, includeHashtags, includeCodeSnippets, threadMode, ctaLinks } = request;

        const isArabic = language === 'ar';
        const toneInstruction = this.getToneInstructions(tone, isArabic);
        const platformInstruction = this.getPlatformInstructions(platform, threadMode ?? false);
        
        const contextText = this.formatContext(context);
        
        const trimmedCustom = request.customPrompt?.trim();
        const userCustomAngle = trimmedCustom
            ? `\n==================================================\nUSER FOCUS / SPECIFIC TOPIC TO EMPHASIZE:\n==================================================\n${trimmedCustom}\n`
            : '';

        const uniqueCtaLinks = ctaLinks?.filter(
            (link, index, links) =>
                links.findIndex(other => other.url === link.url) === index
        );

        let ctaSection = '';
        if (uniqueCtaLinks && uniqueCtaLinks.length > 0) {
            const linksList = uniqueCtaLinks
                .map(link => `- ${link.emoji ? link.emoji + ' ' : ''}${link.label}: ${link.url}`)
                .join('\n');
            ctaSection = `
==================================================
CALL TO ACTION (CTA) & LINKS:
==================================================
${linksList}

- Seamlessly integrate the above link(s) into the post with an appropriate, engaging Call to Action (CTA).
- For single posts, place links naturally towards the conclusion.
- For Twitter/X multi-tweet threads, place the CTA link(s) in the FINAL tweet only. Do not repeat the same CTA link across multiple tweets.
`;
        }

        return `
You are DotShare AI, an expert technical writer and developer advocate.
Your mission is to write a compelling, high-engagement update/release post based on the real project details below.
${userCustomAngle}
==================================================
PROJECT CONTEXT (Ground Truth - DO NOT Hallucinate):
==================================================
${contextText}
${ctaSection}
==================================================
TARGET PLATFORM & FORMATTING RULES:
==================================================
Target Platform: ${platform.toUpperCase()}
${platformInstruction}

==================================================
TONE & WRITING STYLE:
==================================================
Selected Tone: ${tone}
${toneInstruction}

==================================================
URL FIDELITY & STRICT ACCURACY (HARD RULE):
==================================================
- Use ONLY URLs explicitly provided in the CALL TO ACTION (CTA) & LINKS section above.
- URLs present in the PROJECT CONTEXT (such as Repository URL) are strictly background metadata for understanding the codebase; they MUST NOT appear in the final output text or links unless they are also explicitly listed in the CALL TO ACTION (CTA) & LINKS section.
- Copy every CTA URL verbatim without modifying, rewriting, normalizing, or shortening it.
- NEVER invent, guess, autocomplete, rewrite, normalize, shorten, replace, or modify a URL.
- Never infer a website or product URL from a project name, package name, repository name, username, organization, or social handle.
- If no CTA links are provided, DO NOT include ANY URLs or placeholder URLs in the post output.

==================================================
ADDITIONAL CONSTRAINTS:
==================================================
- Language: ${isArabic ? 'Arabic (العربية الفصحى التقنية السلسة مع الحفاظ على المصطلحات البرمجية بالإنجليزية مثل TypeScript, API, Refactoring)' : 'English (Fluent, engaging, developer-focused)'}
- Hashtags: ${includeHashtags ? 'Include 3-5 relevant developer hashtags at the end' : 'DO NOT include hashtags'}
- Code Snippets: ${includeCodeSnippets ? 'Include a concise, illustrative code snippet where appropriate' : 'No code snippets needed unless essential'}
- Accuracy: ONLY mention features, libraries, and changes explicitly listed in the Project Context. Do NOT invent fictional features.
- Output: Return ONLY the final post content. Do not include meta-talk like "Here is your post:".
`.trim();
    }

    /**
     * Formats the extracted project context into clean readable prompt text
     */
    private static formatContext(context: ProjectReleaseContext): string {
        const parts: string[] = [];

        parts.push(`- Project Name: ${context.projectName || 'Software Project'}`);
        if (context.version) parts.push(`- Version / Release: ${context.version}`);
        if (context.projectDescription) parts.push(`- Description: ${context.projectDescription}`);
        if (context.repoUrl) parts.push(`- Repository URL: ${context.repoUrl}`);
        if (context.techStack && context.techStack.length > 0) {
            parts.push(`- Tech Stack: ${context.techStack.join(', ')}`);
        }

        if (context.changelogNotes && context.changelogNotes.length > 0) {
            parts.push('\nLatest Changelog / What\'s New Notes:');
            context.changelogNotes.forEach(note => parts.push(`  • ${note}`));
        }

        if (context.latestCommit) {
            parts.push(`\nLatest Commit Details:\n${context.latestCommit}`);
        }

        if (context.recentCommits && context.recentCommits.length > 0) {
            parts.push('\nRecent Git Commits:');
            context.recentCommits.forEach(commit => parts.push(`  ${commit}`));
        }

        if (context.gitDiffSummary) {
            parts.push(`\nGit Diff Summary:\n${context.gitDiffSummary}`);
        }

        return parts.join('\n');
    }

    /**
     * Returns detailed tone instructions
     */
    private static getToneInstructions(tone: PostTone, isArabic: boolean): string {
        switch (tone) {
            case 'professional':
                return isArabic
                    ? 'أسلوب رسمي واحترافي: ركّز على القيمة التقنية المضافة، استقرار النظام، الإنجازات، واستخدم لغة مهنية متزنة مناسبة لبيئة العمل والشركات.'
                    : 'Professional & Corporate: Focus on value proposition, architectural reliability, business impact, and maintain a polished, authoritative tone.';

            case 'casual_build_in_public':
                return isArabic
                    ? 'أسلوب Build in Public وودي: شارك الرحلة البرمجية بحماس، اذكر الدروس المستفادة، استعمل تعبيرات تشجيعية وتواصل مع المطورين كصديق يشارك إنجازه.'
                    : 'Build in Public & Casual: Authentic, enthusiastic, journey-driven. Share learnings, use engaging hooks, and speak developer-to-developer with relatable energy.';

            case 'technical_deep_dive':
                return isArabic
                    ? 'أسلوب تقني متعمق: ركّز على تفاصيل الكود، تحسينات الأداء، المعمارية (Architecture)، والتفاصيل الدقيقة للتعديلات البرمجية.'
                    : 'Technical Deep-Dive: Focus deeply on code architecture, refactoring decisions, performance benchmarks, and specific technical mechanics.';

            case 'tldr_bulletin':
                return isArabic
                    ? 'أسلوب سريع ومختصر (TL;DR): نقاط سريعة مباشرة جداً بدون مقدمات طويلة، مناسب للقراءة السريعة والملخصات الفورية.'
                    : 'Quick TL;DR & Bulletins: Ultra-concise, scannable bullet points, zero fluff. Highlight only the top 3-4 changes instantly.';

            case 'full_markdown_article':
                return isArabic
                    ? 'مقال تقني كامل بصيغة Markdown نقية: أنشئ مقالاً برمجياً متكاملاً يتضمن مقدمة، شرحاً للمميزات الجديدة، كود توضيحي، وفقرة ختامية وروابط.'
                    : 'Full Technical Blog Article: Write a comprehensive, well-structured technical article with problem statement, detailed feature walkthroughs, and code examples.';
        }
    }

    /**
     * Returns platform-specific constraints and formatting guidelines
     */
    private static getPlatformInstructions(platform: SocialPlatform, threadMode: boolean): string {
        switch (platform) {
            case 'x':
                if (threadMode) {
                    return `
Format as a multi-tweet Thread (3-5 tweets):
- Clearly separate each tweet with the delimiter: "---TWEET---"
- Tweet 1: Powerful hook announcing the release/update.
- Middle tweets: Break down specific features or learnings.
- Final tweet: Conclusion and, when CTA links are provided, the CTA/link(s).
- Prefer CTAs in the final post of the thread. Do not repeat the same CTA link across multiple tweets.
- Note on URL budgeting: URLs count as exactly 23 characters toward the post limit because X wraps URLs with t.co. Do not use literal URL string length when budgeting characters.
- Ensure each separate tweet is strictly under 270 characters.
`;
                }
                return `
Format as a single punchy tweet:
- Strictly under 270 characters total (including hashtags and URLs).
- Compelling hook in the first sentence.
- Bullet points for 2-3 key highlights.
- Note on URL budgeting: URLs count as exactly 23 characters toward the post limit because X wraps URLs with t.co. Do not use literal URL string length when budgeting characters.
`;

            case 'linkedin':
                return `
Format for LinkedIn feed:
- Start with an attention-grabbing first line (Hook) that makes people want to click "see more".
- Use double line breaks between paragraphs for high mobile readability.
- Use clean bullet points (• or ✨) for feature highlights.
- Conclude with an engaging question or CTA.
- If CTA links are provided, integrate the selected link(s) naturally near the conclusion.
- If no CTA links are provided, do not include any URL.
- Do NOT use raw markdown headings like "# Heading" (LinkedIn does not render them).
`;

            case 'devto':
                return `
CRITICAL: STRICT PURE MARKDOWN OUTPUT ONLY.
You MUST format the response starting with YAML Frontmatter, followed by a full Markdown article:

---
title: <Compelling Article Title>
published: true
tags: <comma-separated 3-4 tags, lowercase>
description: <Short 1-2 sentence description>
---

# <Article Title>

## 🚀 Introduction
...

## ⚡ What's New & Key Highlights
...

## 🛠️ Deep Dive & Technical Architecture
...

## 🏁 Conclusion & Links
...
`;

            case 'bluesky':
                return `
Format for BlueSky:
- Max 290 characters total.
- Engaging, tech-community focused tone.
- Include 2-3 relevant tags.
- Note on URL budgeting: URLs consume their actual textual length. Account for full URL length when staying within the 290-character limit. If multiple CTA links cannot fit naturally, prioritize keeping valid post length rather than corrupting or shortening URLs.
`;

            case 'discord':
                return `
Format for Discord Announcements channel:
- Use Discord Markdown (**bold**, __underline__, > blockquotes, \`inline code\`).
- Include organized sections: 📢 **Announcement**, ✨ **Features**, 🐛 **Bug Fixes**.
- Include a 🔗 **Links** section only when CTA links were explicitly provided.
`;

            case 'telegram':
                return `
Format for Telegram Channel / Group:
- Use clean formatting with bold headers (e.g. 🚀 **Release vX.X.X**).
- List changes in clear bullet points.
- Include direct links only when CTA links were explicitly provided.
`;

            default:
                return 'Standard professional social media formatting.';
        }
    }
}
