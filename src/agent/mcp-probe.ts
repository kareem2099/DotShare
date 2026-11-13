import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { AGENT_TOOL_NAMES } from './tool-names';

export interface McpLaunch { command: string; args: string[]; cwd: string; env: Record<string, string>; }
export interface McpProbe { success: boolean; tools: string[]; message: string; }
export type ProbeMcp = (launch: McpLaunch, timeoutMs?: number) => Promise<McpProbe>;

/** A real read-only handshake. Never calls a publishing or authentication tool. */
export const probeMcp: ProbeMcp = async (launch, timeoutMs = 10000) => {
    const client = new Client({ name: 'dotshare-doctor', version: '3.2.1' });
    const transport = new StdioClientTransport({ ...launch, stderr: 'pipe' });
    // Drain diagnostics without displaying them: third-party errors can contain secrets.
    transport.stderr?.on('data', () => undefined);
    try {
        await client.connect(transport, { timeout: timeoutMs });
        const result = await client.listTools({}, { timeout: timeoutMs });
        const tools = result.tools.map(tool => tool.name);
        if (client.getServerVersion()?.name !== 'dotshare' || AGENT_TOOL_NAMES.some(name => !tools.includes(name))) {
            return { success: false, tools, message: 'The server did not identify as DotShare with all required tools. Rebuild or reinstall DotShare.' };
        }
        return { success: true, tools, message: `MCP handshake passed; ${tools.length} tools available.` };
    } catch {
        return { success: false, tools: [], message: 'MCP handshake failed. Check Node, dependencies, server path and process permissions; run npm run compile from a source checkout.' };
    } finally {
        await client.close().catch(() => undefined);
        await transport.close().catch(() => undefined);
    }
};
