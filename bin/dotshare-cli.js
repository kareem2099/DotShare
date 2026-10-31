#!/usr/bin/env node

/**
 * DotShare CLI - Interactive command-line interface for social media posting
 * Usage: dotshare [command] [options]
 *
 * Built output lives in ../out/cli/commands.js (see esbuild.js, "Standalone CLI").
 */

const { Command } = require('commander');
const { setupInitCommand, setupLoginCommand, setupWhoamiCommand, setupDefaultCommand } = require('../out/cli/commands.js');
const { version } = require('../package.json');

const program = new Command();

// CLI metadata
program
    .name('dotshare')
    .description('DotShare CLI - Post to social media platforms')
    .version(version)
    .option('-v, --verbose', 'Enable verbose output');

// Setup all commands
setupInitCommand(program);
setupLoginCommand(program);
setupWhoamiCommand(program);
setupDefaultCommand(program);

// Add help examples
program.addHelpText('after', `
Examples:
  $ dotshare init                    # Initialize CLI configuration
  $ dotshare login telegram          # Authenticate with Telegram
  $ dotshare login linkedin          # Authenticate with LinkedIn
  $ dotshare whoami                  # Show current configuration
  $ dotshare "Hello World!"          # Post to all configured platforms
  $ dotshare --media ./image.jpg     # Post media file
  $ dotshare "Check this" --media ./video.mp4 --platforms telegram,linkedin

For more information, visit: https://github.com/kareem2099/DotShare
`);

// Handle no arguments - show help
if (process.argv.length === 2) {
    program.help();
}

// Parse arguments
program.parse(process.argv);
