import { Entry } from '@napi-rs/keyring';
import { rememberSecret } from '../security/redaction';

export interface CliCredentialStore {
    get(platform: string): string | undefined;
    set(platform: string, value: string): void;
}

/** Native OS credential store. No plaintext fallback if it is unavailable. */
export class OsCredentialStore implements CliCredentialStore {
    get(platform: string): string | undefined {
        try {
            const value = new Entry('DotShare CLI', platform).getPassword() ?? undefined;
            if (value) rememberSecret(value);
            return value;
        } catch {
            throw new Error('OS credential storage is unavailable. Unlock/configure your system keyring and retry.');
        }
    }

    set(platform: string, value: string): void {
        try {
            rememberSecret(value);
            new Entry('DotShare CLI', platform).setPassword(value);
        } catch {
            throw new Error('Could not save credentials in the OS keyring. No plaintext fallback was used.');
        }
    }
}
