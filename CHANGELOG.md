# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-10-28

### Added
- **Manual Post Creation**: Support for creating posts manually without AI generation
- **Enhanced Media Upload**: Drag-and-drop and click-to-browse functionality for attachments
- **Reddit Subreddit Selection**: Modal for subreddit/title/flair selection when sharing to Reddit
- **Reddit User Profile Support**: Ability to post to user profiles (u/) in addition to communities (r/)
- **Real-time UI Feedback**: Platform selector now shows configured platforms dynamically
- **Multi-language Support Improvements**: Language translations update without restart

### Fixed
- Fixed duplicate currentLang variables causing language translations to not update
- Fixed VS Code API multiple acquisition error preventing webview from loading
- Fixed vscode undefined error in modal handlers causing "Choose AI Model" button to fail
- Fixed Saved APIs modal close button event listener missing
- Fixed analytics dashboard showing zeros with tab click refresh logic
- Fixed automatic configuration loading when extension opens
- Removed "Required"/"Optional" badges from platform cards for cleaner UI
- Fixed platform selector not showing configured platforms
- Fixed remaining vscode undefined errors during initialization
- Fixed post-history.ts vscode undefined error
- Fixed Schedule Post and Share Now buttons not activating when platforms selected
- Fixed button enable/disable logic for manual posts
- Fixed 'postMessage undefined' error during initialization
- Fixed media attachment section visibility for manual posts
- Fixed media attachment click handler to work on entire area
- Added null checks for drag and drop handlers
- Fixed vscode.postMessage calls to use safe accessor across multiple files
- Added LinkedIn & Telegram share message handlers
- Fixed individual share buttons to send manual post content
- Implemented multi-platform sharing with manual posts
- Included attached media in all sharing operations
- Fixed Reddit sharing errors by removing hardcoded subreddit

### Changed
- Updated UI to support manual post creation workflow with reorganized layout
- Updated version number to 2.0.0

### Technical Details
- Enhanced webview initialization and event handling
- Improved error recovery and user feedback
- Added comprehensive TypeScript type safety improvements

## [1.0.0] - 2025-10-18

### Added
- **Expanded Platform Support**:
  - 🐦 **X/Twitter Integration**: Complete posting to X (formerly Twitter) with full API support
  - 📘 **Facebook Integration**: Post to Facebook profiles and pages with page management
  - 💬 **Discord Integration**: Webhook-based posting to Discord channels and servers
  - 🟠 **Reddit Integration**: Full Reddit post management including flair, spoilers, link vs self posts
  - 🦋 **BlueSky Integration**: Early adopter support for decentralized social media platform
- **Enhanced AI Capabilities**:
  - 🧠 **Multiple AI Providers**: Support for Gemini, OpenAI, and xAI providers
  - 🎯 **Model Selection**: Choose specific models from each AI provider
  - ✨ **Improved Content Generation**: Enhanced AI-powered post suggestions
- **Advanced Analytics & Tracking**:
  - 📊 **Analytics Dashboard**: Comprehensive tracking of posting performance across all platforms
  - 📈 **Platform-specific Metrics**: Individual success rates and share counts per platform
  - 📋 **Post History**: Complete history with timestamps, AI models used, and success tracking
- **Enhanced Scheduling System**:
  - ⏰ **Multi-platform Scheduling**: Schedule single posts to multiple platforms simultaneously
  - 🎯 **Advanced Status Tracking**: Detailed status updates for each platform in scheduled posts
  - ❌ **Error Handling**: Comprehensive error reporting and retry mechanisms for failed posts
- **API Configuration Management**:
  - 💾 **Saved Configurations**: Save and manage multiple API keys per platform
  - 🔄 **Quick Switching**: Easy switching between different account configurations
  - 🏷️ **Named Configurations**: Label and organize your API settings
- **Media Support**:
  - 📎 **Multi-file Attachments**: Support for uploading images and videos
  - 🎨 **Cross-platform Media**: Media optimization per platform requirements
- **Reddit-specific Features**:
  - 🔗 **Post Types**: Support for both link posts and self posts
  - 🏷️ **Flair Selection**: Choose appropriate flairs for Reddit communities
  - 🚨 **Spoiler Support**: Mark posts as spoilers when needed
  - ✏️ **Post Management**: Edit and delete Reddit posts from within VSCode
- **User Interface Enhancements**:
  - 🖥️ **Activity Bar Integration**: Rich webview interface in VSCode sidebar
  - 🌐 **Multi-language Support**: Arabic and Russian translations
  - 📱 **Responsive Design**: Improved mobile and tablet compatibility
  - 🎨 **Dark/Light Themes**: Multiple theme options including Nebula Dark and Cyber Dark
- **Technical Improvements**:
  - 🔒 **Type Safety**: Comprehensive TypeScript interfaces throughout codebase
  - ⚡ **Performance**: Optimized webview loading and API interactions
  - 🐛 **Error Recovery**: Better error handling and user feedback
  - 📁 **Code Organization**: Modular architecture supporting platform expansion

### Changed
- Updated version number to 1.0.0
- Enhanced VSCode extension manifest with new commands and configurations
- Improved error messages and user guidance

### Technical Details
- Added support for 7 social media platforms (up from 2)
- Comprehensive API integrations with rate limiting and error handling
- Advanced scheduling with platform-specific result tracking
- Full internationalization support for multiple languages

## [0.0.1] - 2025-10-03

### Added
- Initial release of DotShare VS Code extension
- AI-powered social media post generation using Gemini and other models
- Share posts to LinkedIn and Telegram directly from VS Code
- Scheduled posting feature for CLI
- Multi-language support (English, Arabic, Russian)
- Integrated webview UI for managing posts

### Technical Details
- Extension built with TypeScript
- Webview for user interface
- Command-line scheduler tool
- Support for multiple AI providers
