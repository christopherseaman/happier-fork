/**
 * Internal _mcp-bridge command — runs the MCP STDIO bridge directly within the
 * compiled binary, replacing the separate `happier-mcp.mjs` wrapper script.
 *
 * Usage:
 *   happier _mcp-bridge --url http://127.0.0.1:<port>
 *
 * All args are forwarded to the bridge module which parses --url itself.
 */

import type { CommandContext } from '@/cli/commandRegistry';

export async function handleMcpBridgeCliCommand(_context: CommandContext): Promise<void> {
    // The bridge module is a self-executing script — importing it runs main().
    await import('@/backends/codex/happyMcpStdioBridge');
}
