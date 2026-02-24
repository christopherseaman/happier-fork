# Compiled Binary Path Fixes

## Problem

When the CLI is installed as a bun-compiled binary (via `install.sh`), two fatal crashes occur:

1. **`happier daemon start`** dies immediately:
   ```
   Entrypoint /$bunfs/dist/index.mjs does not exist
   ```

2. **`happier cli`** (or any agent command) fails:
   ```
   Cannot find module '/$bunfs/scripts/claude_version_utils.cjs'
   ```

### Root Cause

`projectPath()` in `src/projectPath.ts` uses `dirname(fileURLToPath(import.meta.url))` which resolves to `/$bunfs/root/happier-linux-arm64` inside a bun-compiled binary. This is a virtual filesystem path — those files don't exist on disk. All 18 production call sites that reference files via `projectPath()` break.

## Changes (branch: `fix/compiled-binary-paths`)

### Foundation: `src/utils/runtime.ts`
- `isBunCompiledBinary()` — detects compiled mode via `Bun.main` starting with `/$bunfs/root/`
- `getCompiledBinaryPath()` — returns the real binary path from `process.argv[0]`

### Critical path fixes
| File | What breaks | Fix |
|------|------------|-----|
| `utils/spawnHappyCLI.ts` | Daemon can't find entrypoint to spawn subprocess | Binary re-execs itself with args |
| `backends/claude/utils/resolveClaudeCliPath.ts` | CJS `require()` from `$bunfs` path fails | TypeScript port of claude CLI resolution (env, PATH, native installer, homebrew) |
| `backends/claude/claudeRemote.ts` | Remote launcher CJS path doesn't exist | Uses resolved path directly |
| `backends/claude/utils/generateHookSettings.ts` | Hook forwarder CJS scripts don't exist | New `_hook` subcommand on the binary itself |
| `daemon/controlClient.ts` | `readFileSync` of package.json fails | Falls back to `configuration.currentCliVersion` (compiled in) |
| `integrations/ripgrep/index.ts` | Bundled `rg` binary path doesn't exist | Falls back to system `rg` via `which` |
| `integrations/difftastic/index.ts` | Bundled `difft` path doesn't exist | Falls back to system `difft` via `which` |

### Metadata and service fixes
| File | Fix |
|------|-----|
| `daemon/machine/metadata.ts` | `happyLibDir` → `dirname(binaryPath)` |
| `agent/runtime/createSessionMetadata.ts` | `happyLibDir`/`happyToolsDir` → binary dirname / empty |
| `daemon/startDaemon.ts` | Same pattern for `happyLibDir` |
| `daemon/service/installer.ts` | `nodePath` → binary path, `entryPath` → empty |
| `daemon/service/cli.ts` | Same as installer |
| `agent/runtime/createHappierMcpBridge.ts` | New `compiled-binary` command mode using `_mcp-bridge` subcommand |

### New internal subcommands
| File | Command | Purpose |
|------|---------|---------|
| `cli/commands/hook.ts` | `happier _hook session <port>` / `happier _hook permission <port> [secret]` | Replaces CJS hook forwarder scripts |
| `cli/commands/mcpBridge.ts` | `happier _mcp-bridge --url <url>` | Replaces `happier-mcp.mjs` wrapper script |

### Diagnostics
| File | Fix |
|------|-----|
| `ui/doctor.ts` | Shows binary path and runtime mode instead of checking for missing wrapper scripts |
| `backends/codex/acp/env.ts` | Skips prepending nonexistent `scripts/shims` to PATH |

## Building

```bash
# Install deps and build JS
yarn install
yarn workspace @happier-dev/protocol build
yarn workspace @happier-dev/agents build
cd apps/cli && yarn build

# Compile binary (requires working bun --compile; see note below)
bun build --compile dist/index.mjs --outfile /tmp/happier

# Install
cp /tmp/happier ~/.happier/bin/happier
```

### Known issue: `bun build --compile` on Linux 6.17.0-1003-oracle

On this kernel, `bun build --compile` produces an all-zeros binary. The `sendfile` syscall reports success but writes zeros. Build on a different machine or kernel instead.
