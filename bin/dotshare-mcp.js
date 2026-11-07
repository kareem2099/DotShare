#!/usr/bin/env node
'use strict';
require('../out/agent/server.js').startAgentServer().catch(() => {
    process.stderr.write('DotShare MCP could not start. Check configuration and the system keyring.\n');
    process.exitCode = 1;
});
