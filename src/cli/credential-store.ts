import type { Entry as KeyringEntry } from '@napi-rs/keyring';
import { rememberSecret } from '../security/redaction';

export interface CliCredentialStore {
    get(platform: string): string | undefined;
    set(platform: string, value: string): void;
    delete(platform: string): void;
}

// Load the native module only when needed, so doctor can explain a missing binding.
export function loadKeyringBinding(): { Entry: typeof KeyringEntry } {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Doctor must start even when the native binding cannot load.
    return require('@napi-rs/keyring') as { Entry: typeof KeyringEntry };
}

/** Native OS credential store. No plaintext fallback if it is unavailable. */
export class OsCredentialStore implements CliCredentialStore {
    private entry(platform: string): KeyringEntry {
        const { Entry } = loadKeyringBinding();
        return new Entry('DotShare CLI', platform, process.platform === 'linux' ? { linux: { store: 'secret-service' } } : undefined);
    }
    get(platform: string): string | undefined {
        try {
            const value = this.entry(platform).getPassword() ?? undefined;
            if (value) rememberSecret(value);
            return value;
        } catch {
            throw new Error('OS credential storage is unavailable. Unlock/configure your system keyring and retry.');
        }
    }

    set(platform: string, value: string): void {
        try {
            rememberSecret(value);
            this.entry(platform).setPassword(value);
        } catch {
            throw new Error('Could not save credentials in the OS keyring. No plaintext fallback was used.');
        }
    }

    delete(platform: string): void {
        try {
            this.entry(platform).deletePassword();
        } catch {
            throw new Error('Could not remove credentials from the OS keyring. Unlock/configure your system keyring and retry.');
        }
    }
}
