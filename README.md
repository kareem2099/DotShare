<div align="center">

# 🚀 DotShare

### *Share Your Code Journey, Amplify Your Voice*

[![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)](https://github.com/kareem2099/DotShare)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.74%2B-007ACC?logo=visual-studio-code)](https://code.visualstudio.com/)
[![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js)](https://nodejs.org/)

**Transform your development updates into compelling social media content—right from your IDE.**

[Installation](#-installation) • [Features](#-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Support](#-support)


</div>

---

## 🎯 Why DotShare?

Building in public shouldn't be hard. DotShare bridges the gap between your code editor and your audience, letting you share achievements, updates, and insights across **8 social platforms** with AI-powered assistance—all without leaving VS Code.

### The Problem We Solve

- ⏰ **Time Drain**: Manually crafting posts for multiple platforms
- 🎨 **Writer's Block**: Struggling to articulate technical achievements
- 🔄 **Context Switching**: Jumping between editor and social media
- 📅 **Consistency**: Forgetting to share progress regularly

### Our Solution

A unified, intelligent posting experience that understands your code and speaks your audience's language.

---

## ✨ Features

### 🤖 AI-Powered Content Creation

Leverage cutting-edge AI to transform code updates into engaging narratives:

- **Gemini AI**: Google's latest language model for nuanced technical content
- **OpenAI GPT-4**: Industry-leading conversational AI
- **xAI Grok**: Innovative AI with real-time awareness

```typescript
// Your code speaks for itself—let AI tell the story
const feature = "user authentication";
// → "🎉 Just shipped secure user authentication with JWT! 
//    Now your data is fortress-level protected. #DevLife"
```

### 📱 Platform Integrations

Share seamlessly across your entire professional network:

| Platform | Features | Status |
|----------|----------|--------|
| 🔗 **LinkedIn** | Profile posts, rich media | ✅ Full Support |
| 📱 **Telegram** | Channels, groups, bots | ✅ Full Support |
| 🐦 **X (Twitter)** | Tweets with media | ✅ Full Support |
| 📘 **Facebook** | Profiles, pages | ✅ Full Support |
| 🔵 **Discord** | Webhooks, embeds | ✅ Full Support |
| 🟠 **Reddit** | Subreddits, profiles (r/, u/) | ✅ Full Support |
| 🌅 **BlueSky** | Decentralized social | ✅ Early Access |
| 🎨 **Custom** | API extensibility | 🔧 Coming Soon |

### 🎨 Intuitive Interface

**Manual Mode**: Full creative control with drag-and-drop media support
**AI Mode**: Smart suggestions based on your project context
**Hybrid**: Edit AI-generated content before posting

### ⏰ Automation & Scheduling

Never miss your posting rhythm:

```bash
# Schedule posts for maximum engagement
dotshare schedule --time "09:00" --platforms "linkedin,twitter"

# Automated cross-posting
dotshare "New release v2.1.0 🎉" --all-platforms
```

### 🌐 Multilingual Support

Speak to your global audience:
- 🇬🇧 English
- 🇸🇦 Arabic
- 🇷🇺 Russian
- 🔧 More languages coming soon

### 📊 Analytics Dashboard

Track your reach and engagement across platforms (coming in v2.2):
- Post performance metrics
- Engagement trends
- Best posting times
- Audience insights

---

## 🚀 Quick Start

### For VS Code Users

**Step 1: Install the Extension**

```bash
# Via VS Code Marketplace
1. Press Ctrl+Shift+X (Cmd+Shift+X on Mac)
2. Search "DotShare"
3. Click Install

# Or via command line
code --install-extension kareem2099.dotshare
```

**Step 2: Configure Your First Platform**

```bash
# Open Command Palette (Ctrl+Shift+P)
> DotShare: Configure Settings

# Add your LinkedIn token
Settings > Extensions > DotShare > LinkedIn Token
```

**Step 3: Share Your First Post**

```bash
# Open Command Palette
> DotShare: Generate Social Media Post

# Or use the shortcut
Ctrl+Alt+S (Cmd+Alt+S on Mac)
```

### For CLI Power Users

**Step 1: Install Globally**

```bash
npm install -g dotshare-cli
```

**Step 2: Initialize & Authenticate**

```bash
# Setup wizard
dotshare init

# Connect your platforms
dotshare login linkedin
dotshare login telegram
dotshare login reddit

# Verify setup
dotshare whoami
```

**Step 3: Start Posting**

```bash
# Simple text post
dotshare "🚀 Just deployed v2.0 with dark mode!"

# With media
dotshare "Check out our new UI! 🎨" --media ./screenshot.png

# Specific platforms
dotshare "Backend optimization complete ⚡" --platforms linkedin,twitter
```

---

## 📖 Documentation

### Configuration Deep Dive

DotShare stores configuration in two places:

1. **VS Code Settings**: `settings.json`
2. **CLI Config**: `~/.dotshare/config.json`

#### Essential API Keys

```json
{
  "dotshare.geminiApiKey": "YOUR_GEMINI_KEY",
  "dotshare.linkedinToken": "YOUR_LINKEDIN_TOKEN",
  "dotshare.telegramBot": "YOUR_BOT_TOKEN",
  "dotshare.telegramChat": "YOUR_CHAT_ID"
}
```

#### Getting API Tokens

<details>
<summary><b>🔗 LinkedIn Access Token</b></summary>

1. Create an app at [LinkedIn Developers](https://www.linkedin.com/developers/)
2. Request access to **Sign In with LinkedIn**
3. Generate token with `w_member_social` scope
4. Add to DotShare settings

[Detailed Guide →](https://docs.microsoft.com/en-us/linkedin/shared/authentication/authentication)
</details>

<details>
<summary><b>📱 Telegram Bot Setup</b></summary>

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Create new bot with `/newbot`
3. Copy the bot token
4. Get your chat ID from [@FreeID](https://github.com/kareem2099/FreeID)
5. Add both to DotShare settings

</details>

<details>
<summary><b>🐦 X (Twitter) Authentication</b></summary>

1. Apply for developer access at [Twitter Developers](https://developer.twitter.com/)
2. Create an app with Read & Write permissions
3. Generate API Key, Secret, Access Token, and Access Secret
4. Add to DotShare settings

</details>

<details>
<summary><b>🟠 Reddit App Creation</b></summary>

1. Go to [Reddit Apps](https://www.reddit.com/prefs/apps)
2. Create app (select "script" type)
3. Note your client ID and secret
4. Use OAuth2 flow for access token

</details>

### CLI Command Reference

#### `dotshare init`
Interactive setup wizard for first-time configuration.

```bash
dotshare init
# Prompts for server URL and creates config file
```

#### `dotshare login <platform>`
Authenticate with social platforms via OAuth.

```bash
dotshare login telegram   # Telegram bot auth
dotshare login linkedin   # LinkedIn OAuth flow
dotshare login reddit     # Reddit OAuth flow
```

#### `dotshare whoami`
Display current configuration and authentication status.

```bash
dotshare whoami
# Shows:
# - Server URL
# - Configured platforms
# - Token status
# - Default platforms
```

#### `dotshare [message]`
Post content to configured platforms.

```bash
# Basic post
dotshare "Hello, world! 🌍"

# With media
dotshare "New feature demo" --media ./demo.mp4

# Targeted platforms
dotshare "Professional update" --platforms linkedin

# Media-only post
dotshare --media ./infographic.png
```

**Options:**
- `--media <path>`: Attach image or video (supports: jpg, png, gif, mp4, mov)
- `--platforms <list>`: Comma-separated platform names
- `--scheduled <time>`: Schedule for later (ISO 8601 format)

---

## 🎓 Use Cases

### For Indie Developers

```bash
# Daily standup to your audience
dotshare "Day 47 of #100DaysOfCode: Built a real-time chat with WebSockets! 
Socket.io makes it so smooth. 🚀" --media ./chat-demo.gif
```

### For Development Teams

```bash
# Sprint retrospective
dotshare "Sprint 12 wrapped! ✅ Delivered 23 story points, 
zero production bugs, and our best velocity yet. 
The team is on fire! 🔥" --platforms linkedin,slack
```

### For Content Creators

```bash
# Tutorial announcement
dotshare "New video tutorial: 'Building a REST API in 10 minutes' 
is now live! Link in bio. 📹" --media ./thumbnail.png --platforms twitter,linkedin
```

### For Open Source Maintainers

```bash
# Release announcement
dotshare "v3.0.0 is here! 🎉
• TypeScript rewrite
• 40% faster performance
• New plugin system
Check the release notes!" --all-platforms
```

---

## 🛠️ Advanced Usage

### Custom Post Templates

Create reusable templates for common updates:

```javascript
// .dotshare/templates/release.js
module.exports = {
  template: "{{emoji}} Version {{version}} released!\n\n{{features}}\n\n{{link}}",
  defaults: {
    emoji: "🚀",
    link: "github.com/yourproject/releases"
  }
};
```

### Automation with GitHub Actions

```yaml
# .github/workflows/social-share.yml
name: Share Release
on:
  release:
    types: [published]
jobs:
  share:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install -g dotshare-cli
      - run: dotshare "New release ${{ github.event.release.tag_name }}! 🎉"
        env:
          DOTSHARE_CONFIG: ${{ secrets.DOTSHARE_CONFIG }}
```

### Python Server Integration

For advanced features, run the companion Python server:

```bash
cd DotSharePY
pip install -r requirements.txt
python3 server.py

# Configure CLI to use server
dotshare init --server-url http://localhost:3000
```

---

## 🐛 Troubleshooting

### Common Issues

**"Server connection failed"**
```bash
# Check if server is running
curl http://localhost:3000/health

# Restart server
cd DotSharePY && python3 server.py

# Update server URL
dotshare init
```

**"Authentication failed for LinkedIn"**
```bash
# Verify token hasn't expired (90 days max)
dotshare whoami

# Re-authenticate
dotshare login linkedin

# Check token scopes
# Required: w_member_social, r_liteprofile
```

**"Media upload failed"**
```bash
# Check file size (max 10MB for most platforms)
ls -lh your-image.png

# Verify file format
file your-image.png  # Should show valid image type

# Try compressing
convert your-image.png -quality 85 compressed.png
```

**"Rate limit exceeded"**
```bash
# LinkedIn: 150 posts per day
# Twitter: 300 posts per 3 hours
# Reddit: 1 post per 10 minutes

# Check status
dotshare status

# Wait or use different platform
dotshare "Update" --platforms telegram
```

### Debug Mode

Enable verbose logging:

```bash
# CLI
DOTSHARE_DEBUG=true dotshare "Test post"

# VS Code
Settings > DotShare > Enable Debug Logging
```

### Getting Help

1. 📚 Check [FAQ](https://github.com/kareem2099/DotShare/wiki/FAQ)
2. 🔍 Search [existing issues](https://github.com/kareem2099/DotShare/issues)
3. 📧 Create a [new issue](https://github.com/kareem2099/DotShare/issues/new)

---

## 🤝 Contributing

We love contributions! Here's how you can help:

### Quick Contributions

- 🐛 **Bug Reports**: Found a bug? [Open an issue](https://github.com/kareem2099/DotShare/issues/new?template=bug_report.md)
- 💡 **Feature Requests**: Have an idea? [Share it](https://github.com/kareem2099/DotShare/issues/new?template=feature_request.md)
- 📖 **Documentation**: Improve our docs with a PR
- 🌍 **Translations**: Add support for your language

### Development Setup

```bash
# Clone repository
git clone https://github.com/kareem2099/DotShare.git
cd DotShare

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run tests
npm test

# Start development
code .  # Press F5 to launch extension host
```

### Code Style

We use ESLint and Prettier:

```bash
npm run lint
npm run format
```

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## 📈 Roadmap

### v2.2 (Q1 2025)
- [ ] Analytics dashboard
- [ ] Post scheduling UI in VS Code
- [ ] Instagram integration
- [ ] TikTok support
- [ ] Thread/conversation support

### v2.3 (Q2 2025)
- [ ] Team collaboration features
- [ ] Content calendar view
- [ ] A/B testing for posts
- [ ] Advanced media editing
- [ ] YouTube community posts

### v3.0 (Q3 2025)
- [ ] AI-powered hashtag suggestions
- [ ] Automated content series
- [ ] Cross-platform analytics
- [ ] Custom AI model training
- [ ] White-label solution

[Vote on features →](https://github.com/kareem2099/DotShare/discussions)

---

## 📜 Changelog

### v2.1.0 (Current)
- ✨ Added Reddit integration with subreddit posting
- ✨ BlueSky early adopter support
- 🎨 Enhanced media upload with drag-and-drop
- 🐛 Fixed LinkedIn character limit truncation
- 🚀 CLI performance improvements (30% faster)
- 📖 Russian language support

### v2.0.0
- 🎉 Complete UI redesign with webview
- ✨ Multi-platform scheduling
- ✨ Discord webhook integration
- 🤖 Added xAI Grok support
- 🌐 Arabic language support

[Full changelog →](CHANGELOG.md)

---

## 👏 Acknowledgments

DotShare wouldn't exist without these amazing projects:

- [VS Code Extension API](https://code.visualstudio.com/api) - Microsoft
- [Gemini AI](https://deepmind.google/technologies/gemini/) - Google DeepMind
- [LinkedIn API](https://developer.linkedin.com/) - Microsoft
- [Telegram Bot API](https://core.telegram.org/bots/api) - Telegram
- All our [contributors](https://github.com/kareem2099/DotShare/graphs/contributors) ❤️

---

## 💝 Support the Project

DotShare is free and open source. If it saves you time, consider:

- ⭐ [Star the repository](https://github.com/kareem2099/DotShare)
- 💰 [Sponsor development](https://github.com/sponsors/kareem2099)
- 📢 Share with your network
- 🐛 Report bugs and suggest features
- 📝 Write a blog post or tutorial

Your support keeps this project alive!

---

## 📄 License

DotShare is MIT licensed. See [LICENSE](LICENSE) for details.


<div align="center">

**Made with ❤️ by developers, for developers**

[⬆ Back to Top](#-dotshare)

</div>