# DotShare

[![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](https://github.com/kareem2099/DotShare)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A VS Code extension that helps you share your project updates to social media using AI-powered content generation.

## Features

- 🤖 **AI-Powered Content Generation**: Generate engaging social media posts using Gemini AI
- 🔗 **LinkedIn Integration**: Share posts directly to LinkedIn
- 📱 **Telegram Support**: Post to Telegram channels and groups
- ⏰ **Scheduled Posting**: CLI tool for automated posting
- 🌐 **Multi-language Support**: English, Arabic, and Russian
- 🎨 **Interactive UI**: Built-in webview for managing your posts

## Installation

### VS Code Extension

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "DotShare"
4. Click Install

### CLI Scheduler

The CLI scheduler can be used independently for automated posting:

```bash
npm install -g dotshare
dotshare-scheduler --help
```

## Usage

### Generating Posts

1. Open your project in VS Code
2. Use Command Palette (Ctrl+Shift+P)
3. Run "DotShare: Generate Social Media Post with Gemini"
4. Choose your AI provider and customize the generated content

### Sharing Posts

- Use "DotShare: Share to LinkedIn" to post to LinkedIn
- Use "DotShare: Share to Telegram" to post to Telegram groups/channels

### Scheduled Posting

Use the CLI tool to schedule posts:

```bash
# Schedule a post for later
dotshare-scheduler schedule --platform linkedin --message "My post" --time "2025-10-04T10:00:00"

# Run the scheduler service
systemctl start dotshare-scheduler
```

## Requirements

- VS Code 1.74.0 or higher
- Node.js 18.x or higher
- API keys for AI services (Gemini, OpenAI, etc.)
- API keys for social media platforms

## Configuration

Set up your API keys in VS Code settings or environment variables:

- `dotshare.geminiApiKey`: For Gemini AI
- `dotshare.openaiApiKey`: For OpenAI
- `dotshare.linkedinToken`: LinkedIn access token
- `dotshare.telegramToken`: Telegram bot token

## Development

```bash
git clone https://github.com/kareem2099/DotShare.git
cd DotShare
npm install
npm run compile
# Press F5 in VS Code to test
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the latest updates.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📧 Create an issue on GitHub
- 💝 Support the project: [GitHub Sponsors](https://github.com/sponsors/kareem2099)
