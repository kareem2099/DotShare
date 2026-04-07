# Contributing to DotShare

Thank you for your interest in contributing to DotShare! We welcome contributions from the community — bug fixes, new features, documentation improvements, and translations are all appreciated.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)
- [Code of Conduct](#code-of-conduct)
- [Contact](#contact)

---

## Development Setup

1. **Fork** the repository on GitHub
2. **Clone** your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/DotShare.git
   cd DotShare
   ```
3. **Install** dependencies:
   ```bash
   npm install
   ```
4. **Compile** the extension:
   ```bash
   npm run compile
   ```
5. **Open** in VS Code and press **F5** to launch the Extension Development Host

---

## Project Structure

```
DotShare/
├── src/
│   ├── ai/                  # AI provider integrations (Gemini, OpenAI, Claude, xAI)
│   ├── core/                # Scheduler, post executor, scheduled-posts storage
│   ├── handlers/            # Message, Post, Config handlers
│   ├── platforms/           # Social platform integrations + platform-config.ts
│   ├── services/            # Analytics, History services
│   ├── storage/             # CredentialProvider, StorageManager
│   ├── ui/                  # DotShareWebView
│   └── utils/               # Logger, frontmatter parser, helpers
├── media/
│   └── webview/             # WebView frontend (app.ts, index.html, style.css)
└── .github/
    └── ISSUE_TEMPLATE/      # Bug report & feature request templates
```

**Key rules:**
- `src/platforms/` — social platforms only (character limits, thread splitting, API calls)
- `src/publishers/` — blog platforms only (Dev.to, Medium, markdown/frontmatter logic) — **zero cross-imports** between platforms and publishers
- `media/webview/` — no VS Code API imports here, WebView context only
- `src/platforms/platform-config.ts` — shared between extension and WebView, **no VS Code imports**

---

## Making Changes

1. **Create a branch** for your change:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

2. **Make your changes** following the existing code style

3. **Run the linter and formatter**:
   ```bash
   npm run lint
   npm run format
   ```

4. **Run tests**:
   ```bash
   npm test
   ```

5. **Compile** and verify in the Extension Development Host (F5)

6. **Commit** your changes (see [Commit Guidelines](#commit-guidelines))

7. **Push** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

8. **Open a Pull Request** against the `main` branch

---

## Commit Guidelines

Use clear, descriptive commit messages following this format:

```
<type>: <short description>

[optional body]
[optional footer]
```

**Types:**
| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `chore` | Build process, dependency updates, tooling |
| `test` | Adding or updating tests |
| `style` | Formatting, whitespace (no logic change) |

**Examples:**
```
feat: add Dev.to series field to article publisher
fix: reddit subreddit hardcoded to 'test' in PostExecutor
docs: update README platform table for v3.0
chore: upgrade esbuild to 0.25.11
```

---

## Pull Request Process

1. Ensure your branch is up to date with `main`
2. Verify `npm run lint` passes with zero warnings
3. Verify `npm test` passes
4. Fill out the PR description — what changed and why
5. Link any related issues (`Closes #123`)
6. Request review from a maintainer

PRs that introduce new platform integrations should include:
- The platform file under `src/platforms/` or `src/publishers/`
- An entry in `platform-config.ts`
- Credentials added to `CredentialProvider`
- Settings card added to `index.html`

---

## Reporting Issues

- **Bugs**: Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md)
- **Features**: Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md)
- **Security vulnerabilities**: See [SECURITY.md](SECURITY.md) — **do not open public issues for security bugs**

When reporting bugs, always include:
- DotShare version
- VS Code version
- Operating system
- Steps to reproduce
- Error output from **View → Output → DotShare**

---

## Code of Conduct

This project adheres to our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold it. Please report unacceptable behavior to **kareem209907@gmail.com**.

---

## Contact

- **Email**: kareem209907@gmail.com
- **GitHub**: [@kareem2099](https://github.com/kareem2099)
- **Issues**: [GitHub Issues](https://github.com/kareem2099/DotShare/issues)
- **Discussions**: [GitHub Discussions](https://github.com/kareem2099/DotShare/discussions)
