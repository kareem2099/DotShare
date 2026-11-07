#!/usr/bin/env node
'use strict';
const { Command } = require('commander');
const { setupAgentCommands } = require('../out/agent/commands.js');
const program = new Command().name('dotshare-agent').description('DotShare publishing tools for AI agents');
setupAgentCommands(program);
program.parseAsync(process.argv).catch(() => { process.exitCode = 1; });
