import * as vscode from 'vscode';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

    // Scan for relevant files based on project type
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

                // Add file content to summary (limit each file to 1000 chars to avoid token limits)
                content += `${file}:\n${fileContent.substring(0, 1000)}${fileContent.length > 1000 ? '...[truncated]' : ''}\n\n`;
            } catch (e) {
                // Skip if can't read
            }
        }
    }

    return { projectName, description, content, keywords };
}

async function getGitInfo(workspacePath: string): Promise<{latestCommit: string, recentChanges: string, changedFiles: string}> {
    try {
        // Check if it's a git repository
        await execAsync('git rev-parse --git-dir', { cwd: workspacePath });

        // Get latest commit with full details
        const { stdout: latestCommit } = await execAsync(
            'git show --no-patch --format="Hash: %H%nAuthor: %an <%ae>%nDate: %ad (%ar)%nMessage: %s%n"',
            { cwd: workspacePath }
        );

        // Get recent changes (last 5 commits)
        const { stdout: recentChanges } = await execAsync(
            'git log --max-count=5 --oneline --pretty=format:"• %s (%ar)"',
            { cwd: workspacePath }
        );

        // Get summary of changes in latest commit
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
        // Not a git repo or git not available
        return {
            latestCommit: 'Project is not a git repository',
            recentChanges: 'Cannot access git history - initialize repository with "git init"',
            changedFiles: 'Git information unavailable'
        };
    }
}

export async function generatePost(geminiKey: string, modelName: string = 'gemini-pro'): Promise<PostData | null> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return null;
    }

    const workspacePath = workspaceFolder.uri.fsPath;

    // Automatically detect project type and scan relevant files
    const projectType = await detectProjectType(workspacePath);
    const projectData = await scanProjectFiles(workspacePath, projectType);
    const gitInfo = await getGitInfo(workspacePath);

    // Create intelligent prompt based on project context
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

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    try {
        const result = await model.generateContent(contextPrompt);
        const generatedText = result.response.text();

        // Don't automatically ask for media - let user add it manually if needed
        return {
            text: generatedText.trim(),
            media: undefined // User can add media separately in the UI
        };
    } catch (error: any) {
        // Provide more detailed error info
        let errorMessage = `Gemini API Error: ${error.message}`;
        if (error.message?.includes('quota')) {
            errorMessage = 'API quota exceeded. Check your Gemini API usage.';
        } else if (error.message?.includes('key')) {
            errorMessage = 'Invalid API key. Please check your Gemini API key.';
        }

        vscode.window.showErrorMessage(errorMessage);
        throw error;
    }
}

export async function getAvailableModels(geminiKey: string): Promise<string[]> {
    try {
        // Verify API key by attempting to create a model instance
        const genAI = new GoogleGenerativeAI(geminiKey);
        // Hard-coded list of available models, sorted by latest first
        const models = [
            'gemini-2.5-flash',
            'gemini-2.5-pro',
            'gemini-2.5-flash-lite-preview-06-17',
        ];
        return models;
    } catch (error: any) {
        vscode.window.showErrorMessage(`Gemini API Error fetching models: ${error.message}`);
        throw error; // Re-throw to be caught by extension.ts
    }
}
