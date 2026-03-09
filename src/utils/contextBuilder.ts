import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { detectProjectType, fileExists } from './projectDetector';
import { HashtagContext } from '../services/HashtagService';

const execAsync = promisify(exec);

export interface ContextBuilderResult {
    contextPrompt: string;
    hashtagContext: HashtagContext;
}

/**
 * Builds the complete project context including prompt and hashtag data
 * This is the single source of truth for all AI models
 */
export async function buildProjectContext(): Promise<ContextBuilderResult | null> {
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

Post should be engaging and under 280 characters. 
CRITICAL: DO NOT INCLUDE ANY HASHTAGS IN YOUR RESPONSE. The system will add them automatically.
`.trim();

    const hashtagContext: HashtagContext = {
        projectType,
        keywords: projectData.keywords,
        gitChanges: gitInfo.recentChanges,
        postContent: ''
    };

    return { contextPrompt, hashtagContext };
}

/**
 * Scans relevant project files based on project type
 */
async function scanProjectFiles(
    workspacePath: string,
    projectType: string
): Promise<{ projectName: string; description: string; content: string; keywords: string[] }> {
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
        if (await fileExists(filePath)) {
            try {
                const fileContent = await fsPromises.readFile(filePath, 'utf8');

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

                content += `${file}:\n${fileContent.substring(0, 1000)}${
                    fileContent.length > 1000 ? '...[truncated]' : ''
                }\n\n`;
            } catch {
                // Skip if can't read
            }
        }
    }

    return { projectName, description, content, keywords };
}

/**
 * Retrieves git information about the project
 */
async function getGitInfo(
    workspacePath: string
): Promise<{ latestCommit: string; recentChanges: string; changedFiles: string }> {
    try {
        await execAsync('git rev-parse --git-dir', { cwd: workspacePath, timeout: 3000 });

        const { stdout: latestCommit } = await execAsync(
            'git show --no-patch --format="Hash: %H%nAuthor: %an <%ae>%nDate: %ad (%ar)%nMessage: %s%n"',
            { cwd: workspacePath, timeout: 3000 }
        );

        const { stdout: recentChanges } = await execAsync(
            'git log --max-count=5 --oneline --pretty=format:"• %s (%ar)"',
            { cwd: workspacePath, timeout: 3000 }
        );

        const { stdout: diffStat } = await execAsync('git show --stat --format="" | tail -10', {
            cwd: workspacePath,
            timeout: 3000
        });

        return {
            latestCommit: latestCommit.trim(),
            recentChanges: recentChanges.trim() || 'No recent changes',
            changedFiles: diffStat.trim() || 'No file changes'
        };
    } catch {
        return {
            latestCommit: 'Project is not a git repository',
            recentChanges: 'Cannot access git history - initialize repository with "git init"',
            changedFiles: 'Git information unavailable'
        };
    }
}
