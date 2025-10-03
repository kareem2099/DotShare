# DotShare CLI Scheduler

The CLI scheduler allows you to run scheduled posts **even when VS Code is closed**.

## Prerequisites

1. Install Node.js and npm
2. Clone the DotShare project
3. Run `npm install` to install dependencies
4. Compile the project: `npm run compile`

## Setup

### 1. Create Config File

Create a config file at `~/.dotshare-config.json` (or any location):

```json
{
  "storagePath": "/home/your-user/.config/Code/User/globalStorage/freerave.dotshare",
  "credentials": {
    "linkedinToken": "your_linkedin_access_token",
    "telegramBot": "your_telegram_bot_token",
    "telegramChat": "your_telegram_chat_id_or_username"
  }
}
```

**Find your storage path:**
- VS Code extension data is stored in the global storage directory
- For DotShare, it's typically: `~/.config/Code/User/globalStorage/freerave.dotshare`
- Check the existing `dotshare-scheduled-posts.json` file location

### 2. Get Credentials

#### Telegram Bot Token
1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` and follow instructions
3. Copy the bot token

#### Telegram Chat ID
1. Create a channel/group or use your existing one
2. Add the bot as administrator
3. Send a message in the channel/group
4. Visit: `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`
5. Look for the `chat.id` field

#### LinkedIn Token
- Use the access token from LinkedIn API (if supported)

## Usage

### Manual Run
```bash
# From the project directory
npm run scheduler

# Or directly
node bin/dotshare-scheduler.js

# With custom config path
node bin/dotshare-scheduler.js --config /path/to/config.json
```

### Help
```bash
node bin/dotshare-scheduler.js --help
```

## System Integration

To run automatically even when VS Code is closed:

### Linux/Mac (cron)
```bash
# Edit crontab
crontab -e

# Add line to check every minute
* * * * * cd /path/to/dotshare && /usr/bin/node bin/dotshare-scheduler.js

# Add line to check every 5 minutes
*/5 * * * * cd /path/to/dotshare && /usr/bin/node bin/dotshare-scheduler.js
```

### Windows Task Scheduler
1. Search for "Task Scheduler" in Windows
2. Create new task
3. Set trigger to daily/hourly/minute intervals
4. Set action to run: `node bin/dotshare-scheduler.js`
5. Set start in: path\to\dotshare (the project directory)

### Systemd Service (Linux)
Create `/etc/systemd/system/dotshare-scheduler.service`:

```ini
[Unit]
Description=DotShare Social Media Scheduler
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/dotshare
ExecStart=/usr/bin/node bin/dotshare-scheduler.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable dotshare-scheduler
sudo systemctl start dotshare-scheduler
```

## Features

- **Independent Execution**: Runs without VS Code
- **Same Storage**: Uses the same JSON files as the extension
- **Error Handling**: Logs errors and cleans up failed posts
- **Cross-Platform**: Works on Windows, Mac, Linux
- **Configurable**: Custom config file location
- **Signal Handling**: Graceful shutdown on SIGINT/TERM

## Troubleshooting

### Config File Not Found
```
Config file not found: /home/user/.dotshare-config.json
```
- Create the config file at `~/.dotshare-config.json`
- Or use `--config /path/to/your-config.json`

### Credentials Not Working
- Double-check bot token format: `123456:ABC...`
- Test chat ID: Visit `https://api.telegram.org/bot<TOKEN>/getChat?chat_id=<ID>`
- Ensure bot is added to the channel/group as admin

### Permission Issues
- Make sure the script is executable: `chmod +x bin/dotshare-scheduler.js`
- Ensure Node.js is in PATH for cron/systemd

## Security Notes

- Credentials are stored in plain text in the config file
- Use file permissions: `chmod 600 ~/.dotshare-config.json`
- Consider using environment variables for production
- Never commit config files to version control
