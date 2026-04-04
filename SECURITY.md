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

- All credentials are stored using **VS Code SecretStorage** (backed by the OS keychain — Keychain on macOS, libsecret on Linux, Windows Credential Manager on Windows)
- Credentials are **never** written to plain files, `globalState`, or logs
- OAuth flows run through a dedicated server (`dotshare-auth-server.vercel.app`) — your tokens are never exposed client-side
- The WebView sandbox has no direct access to secrets — all credential reads go through the extension host

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
