import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PostData } from './types';

const execAsync = promisify(exec);

async function detectProjectType(workspacePath: string): Promise<string> {
    const projectFiles = {
        node: ['package.json', 'node_modules', 'tsconfig.json', 'webpack.config.js'],
        rust: ['Cargo.toml', 'Cargo.lock', 'src/main.rs'],
        python: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile', '__init__.py'],
        go: ['go.mod', 'go.sum', 'main.go'],
        java: ['pom.xml', 'build.gradle', 'src/main/java'],
        dotnet: ['.csproj', 'Program.cs', 'Startup.cs'],
        web: ['index.html', 'app.js', 'style.css', 'webpack.config.js'],
        docker: ['Dockerfile', 'docker-compose.yml']
    };

    let maxMatches = 0;
    let detectedType = 'generic';

    for (const [type, files] of Object.entries(projectFiles)) {
        let matches = 0;
        for (const file of files) {
            if (fs.existsSync(path.join(workspacePath, file))) {
                matches++;
            }
        }
        if (matches > maxMatches) {
            maxMatches = matches;
            detectedType = type;
        }
    }

    return detectedType;
}

async function scanProjectFiles(workspacePath: string, projectType: string): Promise<{projectName: string, description: string, content: string, keywords: string[]}> {
    const relevantFiles: { [key: string]: string[] } = {
        node: ['README.md', 'readme.md', 'package.json', 'CHANGELOG.md', 'CONTRIBUTING.md'],
        rust: ['README.md', 'readme.md', 'Cargo.toml', 'CHANGELOG.md'],
        python: ['README.md', 'readme.md', 'setup.py', 'pyproject.toml', 'CHANGELOG.md'],
        go: ['README.md', 'readme.md', 'go.mod', 'CHANGELOG.md'],
        java: ['README.md', 'readme.md', 'pom.xml', 'build.gradle', 'CHANGELOG.md'],
        dotnet: ['README.md', 'readme.md', '.csproj', 'CHANGELOG.md'],
        web: ['README.md', 'readme.md', 'index.html', 'CHANGELOG.md'],
        docker: ['README.md', 'readme.md', 'Dockerfile', 'docker-compose.yml'],
        generic: ['README.md', 'readme.md', 'CHANGELOG.md', 'HISTORY.md']
    };

    let projectName = 'My Project';
    let description = 'A software project';
    const keywords: string[] = [];
    let content = '';

    const filesToCheck = relevantFiles[projectType] || relevantFiles.generic;

    for (const file of filesToCheck) {
        const filePath = path.join(workspacePath, file);
        if (fs.existsSync(filePath)) {
            try {
                const fileContent = fs.readFileSync(filePath, 'utf8');

                if (file.toLowerCase().includes('package.json')) {
                    const packageJson = JSON.parse(fileContent);
                    projectName = packageJson.name || projectName;
                    description = packageJson.description || description;
                    keywords.push(...(packageJson.keywords || []));
                } else if (file.toLowerCase().includes('cargo.toml')) {
                    const lines = fileContent.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('name = ')) {
                            projectName = line.split('=')[1].trim().replace(/"/g, '');
                        } else if (line.startsWith('description = ')) {
                            description = line.split('=')[1].trim().replace(/"/g, '');
                        }
                    }
                }

                content += `${file}:\n${fileContent.substring(0, 1000)}${fileContent.length > 1000 ? '...[truncated]' : ''}\n\n`;
            } catch {
                // Skip if can't read
            }
        }
    }

    return { projectName, description, content, keywords };
}

async function getGitInfo(workspacePath: string): Promise<{latestCommit: string, recentChanges: string, changedFiles: string}> {
    try {
        await execAsync('git rev-parse --git-dir', { cwd: workspacePath });

        const { stdout: latestCommit } = await execAsync(
            'git show --no-patch --format="Hash: %H%nAuthor: %an <%ae>%nDate: %ad (%ar)%nMessage: %s%n"',
            { cwd: workspacePath }
        );

        const { stdout: recentChanges } = await execAsync(
            'git log --max-count=5 --oneline --pretty=format:"• %s (%ar)"',
            { cwd: workspacePath }
        );

        const { stdout: diffStat } = await execAsync(
            'git show --stat --format="" | tail -10',
            { cwd: workspacePath }
        );

        return {
            latestCommit: latestCommit.trim(),
            recentChanges: recentChanges.trim() || 'No recent changes',
            changedFiles: diffStat.trim() || 'No file changes'
        };
    } catch (e) {
        return {
            latestCommit: 'Project is not a git repository',
            recentChanges: 'Cannot access git history - initialize repository with "git init"',
            changedFiles: 'Git information unavailable'
        };
    }
}

export async function generatePost(apiKey: string, model = 'grok-beta'): Promise<PostData | null> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return null;
    }

    const workspacePath = workspaceFolder.uri.fsPath;

    const projectType = await detectProjectType(workspacePath);
    const projectData = await scanProjectFiles(workspacePath, projectType);
    const gitInfo = await getGitInfo(workspacePath);

    const contextPrompt = `
IMPORTANT: You MUST ONLY use the information provided below. Do NOT make up or hallucinate any features, technologies, or details that are not explicitly mentioned in the project files.

Project Information:
- Project Name: ${projectData.projectName || 'Unknown Project'}
- Description: ${projectData.description || 'No description available'}
- Type: ${projectType.charAt(0).toUpperCase() + projectType.slice(1)} project
- Keywords: ${projectData.keywords.join(', ') || 'No keywords specified'}

Actual Project Files and Content:
${projectData.content || 'No project content found'}

Git Status:
${gitInfo.latestCommit}
${gitInfo.recentChanges}
${gitInfo.changedFiles}

TASK: Based on the EXACT information above about this specific project, create a social media post announcing recent developments. Focus on:
1. What was actually implemented or changed (from git info)
2. The technologies actually used (from package.json and file analysis)
3. The actual features mentioned in the code/files
4. Keep the language technical and project-specific

Do NOT mention any technologies or features not found in the files above. If there's limited information, keep the post brief and accurate.

Post should be engaging, under 280 characters, and include 1-2 relevant hashtags from the project context.
`.trim();

    // xAI API implementation (using fetch since official SDK not available)
    try {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: 'You are Grok, a helpful AI created by xAI. Create engaging social media posts based on project context and git history.' },
                    { role: 'user', content: contextPrompt }
                ],
                max_tokens: 300
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const generatedText = data.choices?.[0]?.message?.content || '';

        return {
            text: generatedText.trim(),
            media: undefined
        };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        let detailedMessage = `xAI API Error: ${errorMessage}`;
        if (errorMessage.includes('401')) {
            detailedMessage = 'Invalid xAI API key. Please check your credentials.';
        } else if (errorMessage.includes('429')) {
            detailedMessage = 'xAI API rate limit exceeded. Please try again later.';
        } else if (errorMessage.includes('fetch')) {
            detailedMessage = 'Network error connecting to xAI API. Check internet connection.';
        }

        vscode.window.showErrorMessage(detailedMessage);

        // Fallback response for development
        if (errorMessage.includes('fetch') || errorMessage.includes('Failed to fetch')) {
            const fallbackText = `🚀 Exciting updates in ${projectData.projectName}! Just pushed new features including major improvements to our ${projectType} codebase. Check out the latest changes with enhanced performance and better developer experience. #opensource #${projectType}`;
            return {
                text: fallbackText,
                media: undefined
            };
        }

        throw error;
    }
}

export async function getAvailableModels(): Promise<string[]> {
    try {
        // Placeholder for xAI API call to list models
        // const response = await fetch('https://api.x.ai/v1/models', {
        //     headers: { 'Authorization': `Bearer ${apiKey}` }
        // });
        // const data = await response.json();
        // return data.models.map((model) => model.id);

        // For now, return hardcoded models
        return ['grok-beta', 'grok-1'];
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`xAI API Error fetching models: ${errorMessage}`);
        throw error; // Re-throw to be caught by extension.ts
    }
}
