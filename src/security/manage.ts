import * as fs from 'fs';
import * as path from 'path';
import { AccountStore } from '../agent/accounts';
import { ConfigManager } from '../cli/config';
import { checkPrivateFile, privateDirectory } from './private-files';

export function securityStatus(accounts = new AccountStore()) {
    return { home: accounts.home, backendPolicy: process.platform === 'linux' ? 'required-secret-service' : 'native-os-credential-store',
        ...accounts.files.status(), notes: ['Status does not read platform credentials or prove the OS provider encrypts its own database.', 'The OS keyring must remain available to decrypt local records. No master key is stored in local files.'] };
}
export function protectStorage(accounts = new AccountStore()) {
    privateDirectory(accounts.home, true);
    const metadata = path.join(accounts.home, 'accounts.json');
    if (fs.existsSync(metadata)) checkPrivateFile(metadata, true);
    // Verify existing credentials first. Never silently move from an unverified Linux fallback store.
    const local = accounts.list(); for (const account of local) accounts.credentials(account.id);
    const legacy = path.join(accounts.home, 'config.json');
    if (fs.existsSync(legacy)) { checkPrivateFile(legacy, true); new ConfigManager(accounts.home).getConfig(); }
    const result = accounts.files.protect();
    return { protected: true, migrated: result.encrypted, ...result, accountsVerified: local.length, ...securityStatus(accounts), keyAccess: 'verified',
        nextSteps: ['Restart/reconnect all DotShare MCP clients and VS Code windows to unload older processes.', 'Keep an OS-keyring backup as well as encrypted files. Losing the master key cannot be repaired by generating a replacement.', 'Already existing filesystem snapshots/backups may retain old plaintext; encryption does not securely erase past copies.'] };
}
