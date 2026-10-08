# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 3.0.x   | ✅ Active support |
| 2.4.x   | ⚠️ Security fixes only |
| < 2.4   | ❌ No longer supported |

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability in DotShare, please **do not** open a public GitHub issue.

### How to Report

**Email**: kareem209907@gmail.com  
**Subject**: `[SECURITY] DotShare — <brief description>`

Please include:
- A clear description of the vulnerability
- Steps to reproduce it
- Potential impact (what an attacker could do)
- Your VS Code and DotShare version
- Any suggested fix (optional but appreciated)

### What to Expect

- **Acknowledgement**: Within 48 hours
- **Status update**: Within 7 days
- **Fix timeline**: Critical issues within 14 days, others within 30 days
- **Credit**: We'll credit you in the release notes (unless you prefer to stay anonymous)

## Credential Security

DotShare handles sensitive API keys and OAuth tokens. Here's how we protect them:

- Extension credentials use **VS Code SecretStorage**; the webviews receive saved status only. A saved key is shown as **🔒 Key Saved & Active** without returning or displaying its value.
- Empty replacement fields retain the existing secret. Saved API configurations are activated on the extension host.
- Credential values and complete OAuth callback URLs are excluded from logs. Known secrets and common token formats are redacted from diagnostic messages.
- Old plaintext Saved API state is removed only after a secure copy exists. CLI credentials use the native OS credential store; CLI configuration files contain preferences only. Secure-storage failures do not fall back to plaintext.
- Cloud credential upload requires user consent. Local SecretStorage guarantees do not cover server-side storage; review the deployed backend separately.
- Clearing local credentials removes platform, AI, GitHub and DotShare account secrets and remembered cloud consent. Previously uploaded cloud credentials must be revoked separately.
- Historical logs from older versions may contain credentials; these code changes do not remove historical logs or rotate previously exposed tokens.

## Out of Scope

The following are **not** considered security vulnerabilities:

- Issues in outdated/unsupported versions
- Rate limiting by third-party platforms (LinkedIn, Reddit, etc.)
- Social engineering attacks requiring physical access
- Bugs already publicly disclosed before the report

## Disclosure Policy

We follow **responsible disclosure**. We ask that you:
1. Give us reasonable time to fix the issue before public disclosure
2. Avoid accessing or modifying other users' data
3. Not perform denial-of-service attacks

Thank you for helping keep DotShare secure. 🔒
