module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/extension.ts',
        '!src/handlers/**',
        '!src/ui/**',
        '!src/server/**'
    ],
    coveragePathIgnorePatterns: [
        '/node_modules/',
        'out/'
    ],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: {
                module: 'commonjs',        // ← fixes no-var-requires
                target: 'ES2020',
                esModuleInterop: true,
                allowSyntheticDefaultImports: true,
                strict: false,             // ← tests are lighter than production
                sourceMap: true,
            }
        }]
    },
    setupFilesAfterEnv: ['<rootDir>/src/ai/__tests__/setup.ts'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^vscode$': '<rootDir>/src/ai/__tests__/__mocks__/vscode.ts'  // ← mock vscode
    },
    // Show coverage summary in terminal
    coverageReporters: ['text', 'lcov'],
};