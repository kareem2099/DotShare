export const window = {
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    activeTextEditor: undefined,
    createWebviewPanel: jest.fn(),
    createOutputChannel: jest.fn().mockReturnValue({
        appendLine: jest.fn(),
        clear: jest.fn(),
        show: jest.fn(),
        dispose: jest.fn()
    })
};

export const workspace = {
    getConfiguration: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue('twitter')
    }),
    workspaceFolders: [
        {
            uri: { fsPath: '/mock/workspace' },
            name: 'mock-workspace',
            index: 0
        }
    ],
    openTextDocument: jest.fn()
};

export const Uri = {
    parse: jest.fn((str: string) => ({ toString: () => str, fsPath: str })),
    file: jest.fn((str: string) => ({ toString: () => str, fsPath: str }))
};

export const commands = {
    executeCommand: jest.fn(),
    registerCommand: jest.fn()
};

export const ViewColumn = {
    One: 1,
    Two: 2,
    Three: 3,
    Beside: -1
};

export const env = {
    openExternal: jest.fn()
};

export default {
    window,
    workspace,
    Uri,
    commands,
    ViewColumn,
    env
};
