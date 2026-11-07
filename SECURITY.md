# DotShare local security model

This describes the protections implemented in this checkout. It is not an
independent security certification or a claim that the entire operating system,
every platform adapter, or the separate DotSuite backend has been audited.

## Credentials

- CLI/MCP platform credentials and the DotSuite session token live in the native
  OS credential store, not JSON configuration, command arguments or MCP responses.
- On Linux, every entry explicitly requires **Secret Service**. An unavailable or
  locked provider fails closed. Automatic fallback to the kernel keyutils store is
  disabled. Existing kernel-fallback entries are not silently copied; reconnect
  affected accounts through hidden CLI prompts after configuring Secret Service.
- macOS/Windows use their native OS stores. VS Code account/AI credentials continue
  to use VS Code SecretStorage, with status-only responses to webviews and host-side
  secret redaction. DotShare cannot attest how the chosen OS/VS Code provider
  encrypts its own database; configure a password-protected provider and OS account.
- Local account IDs are shared by the OS user's CLI service, as before. Different
  `DOTSHARE_HOME` directories are not separate user/security identities for platform
  keys; use distinct IDs to avoid accidental replacement. Separate OS users are
  required for isolation from other local users.
- The legacy CLI relay publishing path is disabled: it used to send raw platform
  credentials to a configured intermediary. Legacy login no longer echoes secrets.
  Use `accounts add` and the direct named-account publishing commands/tools.
- Cloud credential sync remains a separate explicit-consent feature of the extension;
  this change does not verify or change the remote backend's credential storage.

## Encrypted shared library

Saved agent drafts, custom templates and operation journals under `DOTSHARE_HOME`
use **AES-256-GCM** with a cryptographically random 256-bit key, a fresh random
96-bit nonce per write and a required 128-bit authentication tag. Associated data
binds the format version, key ID, category and record filename; swapping or renaming
ciphertext between records fails authentication. A key-confirmation HMAC prevents
a substituted OS key from being used to overwrite records under the same key ID.
Encryption/decryption use Node's built-in crypto implementation.

The master key is stored only in the required OS credential store under a random
`vault:<keyId>` entry. `security.json` contains a public key ID and key confirmation,
not the master key. No password, master-key environment variable or local plaintext
file fallback is accepted. The first saved record needs an unlocked/available OS
keyring. Missing, malformed or mismatched keys do not trigger key regeneration for
an existing vault.

Directories/files are private (0700/0600 on Unix), checked for ownership and regular
file type. Symlinks and multiply linked files are refused. Writes use exclusive
private temporary files, file/directory fsync and atomic replacement. Exclusive
operation claims survive failed writes so an uncertain operation cannot simply be
resent. Short cross-process write/migration and record locks prevent concurrent
commits from silently replacing each other. Stale locks require inspection rather
than automatic removal. File reads and decoded records are bounded.

Account IDs/labels, non-secret CLI configuration and vault metadata remain private
metadata rather than encrypted content. Built-in recipes are public source data.
Original user-selected images and private temporary upload copies are not encrypted
by the record vault. Earlier platform-composer drafts remain in VS Code global state;
they are not silently migrated into the shared agent library.

## Upgrading an existing library

Stop active publications, update/build the checkout, then run:

```sh
node bin/dotshare-agent.js security status
node bin/dotshare-agent.js security protect
node bin/dotshare-agent.js doctor --check-accounts
```

`status` inventories file formats/permissions without reading platform credentials
or the master key. It is not a decryption/authentication test. `protect` verifies
existing account access, tightens owned storage permissions, preflights JSON and
existing ciphertext, and encrypts legacy records in place under a write lock. Each
converted record is authenticated/read back and compared with its original content.
It preserves IDs, revisions and publication receipts. It does not publish, upload,
refresh tokens, change MCP configuration, export keys or create plaintext backups.
The migration is resumable; do not reset the vault if any record fails.

Restart **all** DotShare MCP clients and VS Code windows afterwards. Older already
running processes still contain the previous code and cannot be made safe by changing
files on disk alone. New code refuses legacy plaintext during normal reads instead
of silently continuing without encryption. `doctor` reports plaintext/unreadable
records separately, and checks key access only with account checks enabled.

Encrypting a file does not securely erase prior disk pages, OS snapshots, sync
copies, logs or backups. Review existing copies according to your storage/backup
policy; the application does not delete them automatically.

## Recovery and rotation

Back up the encrypted records, `security.json` and the OS keyring using the OS/provider's
protected backup facilities. Files alone cannot recover a lost master key. Do not
delete the manifest, generate a replacement key, or copy a key beside ciphertext
as a recovery shortcut. Restore the matching original key/metadata. Vault master-key
rotation/export is not implemented by this change; perform a separately reviewed
re-encryption migration rather than editing `security.json` or the keyring entry.

For suspected platform-token compromise, revoke/rotate at the platform, then run
`accounts add` for that account using hidden prompts. Local account removal deletes
the local credential; it does not revoke the provider token. Inspect already claimed
operations before any new publish action.

## Transport and disclosure controls

- Credential-bearing API requests do not follow HTTP redirects. Axios defaults and
  direct requests are hardened; extension cloud fetches use `redirect:error`.
  Insecure global TLS verification/agents are refused in these guarded paths.
- LinkedIn upload destinations must be HTTPS LinkedIn hosts before attaching the
  bearer token. Discord webhooks require the canonical HTTPS Discord API shape.
- Known configured secrets, standard token patterns and Telegram/Discord credential
  URL segments are redacted from diagnostics. Structured logging omits request
  configs, headers and credential fields and handles circular values safely.
- Malformed credential JSON and corrupted stored JSON produce generic errors without
  echoing input contents. Credential input files must be owned, private regular files;
  hidden terminal prompts or stdin are preferred.
- Publishing/scheduling blocks known credentials in the selected content before
  claiming/sending the action. This is a guard for registered secrets, not a general
  proof that source code/images or arbitrary user text contain no secrets.
- MCP tools never expose the master/platform keys. The UI uses the same server,
  respects configured tool allow/deny lists, escapes content as text, and publishes
  saved drafts only with their exact revision/preview and stable request ID.

An unlocked OS account, same-user malware, a compromised extension/agent with code
execution, root/admin access, memory inspection and a compromised platform/backend
are outside the protection provided by local-file encryption. Use OS account
isolation, screen locking and full-disk encryption as appropriate. No application
can safely claim that keys are inaccessible to code running with the owner's full
permissions.

## Verification and references

Unit/integration tests cover ciphertext-only persistence, tag/nonce/key tampering,
wrong record identity, missing/substituted keys, explicit migration, private file
checks, keyring pinning, redaction, redirect rejection and leak blocking.
`node scripts/verify-security.cjs` tests the real OS keyring and loopback redirects
with disposable keys/fixtures only. `verify-agent.cjs` and `verify-library.cjs` test
encrypted records across actual MCP/CLI processes without real publications. Tests
clean up their temporary keyring master entries. Dependency audit results are a
point-in-time known-advisory check, not a full supply-chain review.

- [Node crypto authenticated-encryption API](https://nodejs.org/api/crypto.html)
- [Keyring binding and Linux backend selection](https://github.com/Brooooooklyn/keyring-node)
- [LinkedIn upload URL documentation](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/documents-api)

Dotenvy integration remains independent of these protections and has not been added.
