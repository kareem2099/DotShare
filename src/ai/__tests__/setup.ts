// Jest setup file for mocking common dependencies

// Mock VS Code API globally
jest.mock('vscode', () => ({
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn()
    },
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue('twitter')
        })
    }
}), { virtual: true });

// Global test timeout
jest.setTimeout(10000);

// Suppress console output during tests (optional)
const originalError = console.error;
beforeAll(() => {
    console.error = (...args: unknown[]) => {
        if (
            typeof args[0] === 'string' &&
            (args[0].includes('Warning: ReactDOM.render') ||
             args[0].includes('DeprecationWarning'))
        ) {
            return;
        }
        originalError.call(console, ...args);
    };
});

afterAll(() => {
    console.error = originalError;
});
