/** Examples are content recipes, not invented release facts or publishing actions. */
export const TEMPLATE_PRESETS = [
    {
        id: 'builtin-release', name: 'Release announcement', description: 'One release, with platform-specific announcement formats and a Markdown article body.',
        variables: { link: { type: 'url', description: 'Verified project or release URL' } },
        content: { text: '{{project}} {{version}} is out!\n\nWhat’s new:\n{{highlights}}\n\n{{link}}',
            article: { title: '{{project}} {{version}}: release notes', tags: ['release'], published: true } },
        platformVariants: {
            linkedin: { text: 'Introducing {{project}} {{version}}.\n\n{{highlights}}\n\nLearn more: {{link}}' },
            x: { text: '{{project}} {{version}} is out!\n\n{{highlights}}\n\n{{link}}' },
            bluesky: { text: '{{project}} {{version}} is out!\n\n{{highlights}}\n\n{{link}}' },
            mastodon: { text: '{{project}} {{version}} is out!\n\n{{highlights}}\n\n{{link}}' },
            devto: { text: '# {{project}} {{version}}\n\n## What changed\n\n{{highlights}}\n\n## Learn more\n\n{{link}}' },
        },
    },
    {
        id: 'builtin-progress', name: 'Build in public update', description: 'Share verified progress, a next step and a project link.',
        variables: { link: { type: 'url' } },
        content: { text: 'Building {{project}}\n\nToday’s progress:\n{{progress}}\n\nNext: {{next_step}}\n\n{{link}}' },
        platformVariants: { linkedin: { text: 'A progress update on {{project}}.\n\n{{progress}}\n\nThe next step is {{next_step}}.\n\nFollow along: {{link}}' } },
    },
    {
        id: 'builtin-launch', name: 'Project launch', description: 'Introduce a project using the supplied audience, benefit and URL.',
        variables: { link: { type: 'url' } },
        content: { text: 'Meet {{project}} — {{summary}}\n\nBuilt for {{audience}}.\n\nTry it: {{link}}' },
        platformVariants: { linkedin: { text: 'Introducing {{project}}.\n\n{{summary}}\n\nWho it’s for: {{audience}}\n\nExplore the project: {{link}}' } },
    },
    {
        id: 'builtin-bugfix', name: 'Bug fix announcement', description: 'Explain a concrete before/after change without inventing verification.',
        variables: { link: { type: 'url' } },
        content: { text: '{{project}} update\n\nFixed: {{problem}}\nNow: {{result}}\n\n{{link}}' },
    },
    {
        id: 'builtin-article', name: 'Technical article', description: 'A Markdown article assembled from supplied title, introduction, details and conclusion.',
        content: { text: '# {{title}}\n\n{{introduction}}\n\n## How it works\n\n{{details}}\n\n## What’s next\n\n{{conclusion}}',
            article: { title: '{{title}}', tags: ['development'], published: true } },
    },
];
