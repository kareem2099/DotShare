import { promises as fsPromises, constants as fsConstants } from 'fs';
import * as path from 'path';

/**
 * Helper method to check if a file exists asynchronously
 */
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fsPromises.access(filePath, fsConstants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Detects the type of project based on configuration files present in the workspace
 */
export async function detectProjectType(workspacePath: string): Promise<string> {
    const projectFiles = {
        node: ['package.json', 'node_modules', 'tsconfig.json', 'webpack.config.js'],
        rust: ['Cargo.toml', 'Cargo.lock', 'src/main.rs'],
        python: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile', '__init__.py'],
        go: ['go.mod', 'go.sum', 'main.go'],
        java: ['pom.xml', 'build.gradle', 'src/main/java'],
        dotnet: ['.csproj', 'Program.cs', 'Startup.cs'],
        web: ['index.html', 'app.js', 'style.css', 'webpack.config.js'],
        docker: ['Dockerfile', 'docker-compose.yml'],
        php: ['composer.json', 'artisan', 'index.php'] // ضفتلك PHP بالمرة كهدية 😉
    };

    let maxMatches = 0;
    let detectedType = 'generic';

    for (const [type, files] of Object.entries(projectFiles)) {
        let matches = 0;
        for (const file of files) {
            if (await fileExists(path.join(workspacePath, file))) {
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