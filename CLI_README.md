# DotShare CLI

Interactive command-line interface for posting to social media platforms via the DotShare Python server.

## Prerequisites

1. **Python Server**: Make sure the DotShare Python server is running on port 3000
   ```bash
   cd DotSharePY
   python3 server.py
   ```

2. **Node.js Dependencies**: Install required packages
   ```bash
   npm install
   npm run compile
   ```

## Quick Start

1. **Initialize CLI**:
   ```bash
   npm run cli init
   # or
   ./bin/dotshare-cli.js init
   ```

2. **Login to platforms**:
   ```bash
   npm run cli login telegram
   npm run cli login linkedin
   npm run cli login reddit
   ```

3. **Check status**:
   ```bash
   npm run cli whoami
   ```

4. **Start posting**:
   ```bash
   npm run cli "Hello from CLI!"
   npm run cli "Check this image" --media ./photo.jpg
   ```

## Commands

### `dotshare init`
Initialize CLI configuration and test server connection.

```bash
dotshare init
```

### `dotshare login <platform>`
Authenticate with social media platforms. Opens browser for OAuth flow.

```bash
dotshare login telegram   # Telegram authentication
dotshare login linkedin   # LinkedIn authentication
dotshare login reddit     # Reddit authentication
```

### `dotshare whoami`
Show current configuration and authenticated platforms.

```bash
dotshare whoami
```

### `dotshare [message]` (Default)
Post message to all configured platforms.

```bash
# Post text message
dotshare "Hello World!"

# Post with media
dotshare "Check this out!" --media ./image.jpg

# Post to specific platforms
dotshare "Test post" --platforms telegram,linkedin

# Post media only
dotshare --media ./video.mp4
```

## Options

- `--media <path>`: Path to media file (image/video)
- `--platforms <list>`: Comma-separated list of platforms (telegram,linkedin,reddit)

## Configuration

Configuration is stored in `~/.dotshare/config.json`:

```json
{
  "serverUrl": "http://localhost:3000",
  "credentials": {
    "telegram": {
      "botToken": "your_bot_token",
      "chatId": "your_chat_id"
    },
    "linkedin": {
      "accessToken": "your_access_token"
    },
    "reddit": {
      "accessToken": "your_access_token",
      "refreshToken": "your_refresh_token"
    }
  },
  "defaultPlatforms": ["telegram", "linkedin", "reddit"]
}
```

## Environment Variables

- `DOTSHARE_SERVER_URL`: Python server URL (default: http://localhost:3000)

## Examples

```bash
# Initialize
dotshare init

# Authenticate all platforms
dotshare login telegram
dotshare login linkedin
dotshare login reddit

# Check status
dotshare whoami

# Post to all platforms
dotshare "🚀 Just deployed a new feature!"

# Post with image
dotshare "Beautiful sunset today 🌅" --media ./sunset.jpg

# Post to specific platforms
dotshare "Team update" --platforms telegram,linkedin

# Post video
dotshare "Check our new demo!" --media ./demo.mp4
```

## Troubleshooting

### "Server connection failed"
- Make sure the Python server is running: `cd DotSharePY && python3 server.py`
- Check that the server URL is correct (default: http://localhost:3000)

### "No platforms configured"
- Run `dotshare login <platform>` to authenticate with platforms
- Check `dotshare whoami` to see configured platforms

### "Authentication failed"
- Verify your credentials are correct
- Check that the Python server has the right environment variables
- Try re-authenticating with `dotshare login <platform>`

### Permission Issues
- Make sure the CLI has execute permissions: `chmod +x bin/dotshare-cli.js`
- Check file permissions for `~/.dotshare/config.json`

## Development

To modify the CLI:

1. Edit commands in `src/cli/commands.ts`
2. Edit config management in `src/cli/config.ts`
3. Compile: `npm run compile`
4. Test: `npm run cli --help`
