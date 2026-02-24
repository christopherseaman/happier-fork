import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

import { projectPath } from '@/projectPath';
import { isBunCompiledBinary } from '@/utils/runtime';

type ClaudeVersionUtilsModule = {
  getClaudeCliPath: () => string;
};

let cachedResolvedClaudeCliPath: string | null = null;

function resolvePathSafe(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  try { return realpathSync(filePath); } catch { return filePath; }
}

function findClaudeInPath(): string | null {
  try {
    const command = platform() === 'win32' ? 'where claude' : 'which claude';
    const result = execSync(command, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const firstLine = result.split(/\r?\n/)[0]?.trim();
    if (firstLine && existsSync(firstLine)) {
      return resolvePathSafe(firstLine) ?? firstLine;
    }
  } catch {
    // claude not in PATH
  }
  return null;
}

function findNativeInstallerCliPath(): string | null {
  const home = homedir();
  const plat = platform();

  if (plat === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
    for (const base of [join(localAppData, 'Claude'), join(home, '.claude')]) {
      if (!existsSync(base)) continue;
      const exe = join(base, 'claude.exe');
      if (existsSync(exe)) return exe;
    }
    const localBinExe = join(home, '.local', 'bin', 'claude.exe');
    if (existsSync(localBinExe)) return localBinExe;
  }

  const localBin = join(home, '.local', 'bin', 'claude');
  const resolved = resolvePathSafe(localBin);
  if (resolved) return resolved;

  const versionsDir = join(home, '.local', 'share', 'claude', 'versions');
  if (existsSync(versionsDir)) {
    try {
      const entries = readdirSync(versionsDir).sort().reverse();
      for (const entry of entries) {
        const versionPath = join(versionsDir, entry);
        const s = statSync(versionPath);
        if (s.isFile()) return versionPath;
        if (s.isDirectory()) {
          const exe = join(versionPath, plat === 'win32' ? 'claude.exe' : 'claude');
          if (existsSync(exe)) return exe;
          const cliJs = join(versionPath, 'cli.js');
          if (existsSync(cliJs)) return cliJs;
        }
      }
    } catch {
      // versions dir read failed
    }
  }

  return null;
}

function findHomebrewCliPath(): string | null {
  const plat = platform();
  if (plat !== 'darwin' && plat !== 'linux') return null;

  const prefixes = [
    '/opt/homebrew',
    '/usr/local',
    join(homedir(), '.linuxbrew'),
    join(homedir(), '.homebrew'),
  ].filter(existsSync);

  for (const prefix of prefixes) {
    const binPath = join(prefix, 'bin', 'claude');
    const resolved = resolvePathSafe(binPath);
    if (resolved && existsSync(resolved)) return resolved;
  }
  return null;
}

/**
 * Resolve the claude CLI path without depending on the CJS helper scripts.
 * Used when running as a compiled binary where scripts/ is not on disk.
 * Mirrors the priority order from claude_version_utils.cjs:
 *   env override → PATH → native installer → homebrew
 */
function resolveClaudeCliPathDirect(): string {
  // 1. Explicit env override
  const envPath = (process.env.HAPPIER_CLAUDE_PATH || process.env.HAPPY_CLAUDE_PATH || '').trim();
  if (envPath) {
    if (envPath === 'claude') return 'claude';
    const resolved = resolvePathSafe(envPath);
    if (resolved) return resolved;
  }

  // 2. PATH lookup
  const pathResult = findClaudeInPath();
  if (pathResult) return pathResult;

  // 3. Native installer locations
  const nativePath = findNativeInstallerCliPath();
  if (nativePath) return nativePath;

  // 4. Homebrew
  const homebrewPath = findHomebrewCliPath();
  if (homebrewPath) return homebrewPath;

  throw new Error(
    'Claude Code is not installed.\n' +
    'Install it with: curl -fsSL https://claude.ai/install.sh | bash'
  );
}

export function resolveClaudeCliPath(): string {
  if (cachedResolvedClaudeCliPath) {
    return cachedResolvedClaudeCliPath;
  }

  // Compiled binary: CJS scripts aren't available on the $bunfs virtual filesystem.
  if (isBunCompiledBinary()) {
    cachedResolvedClaudeCliPath = resolveClaudeCliPathDirect();
    return cachedResolvedClaudeCliPath;
  }

  const require = createRequire(import.meta.url);
  const utilsPath = join(projectPath(), 'scripts', 'claude_version_utils.cjs');
  const mod = require(utilsPath) as ClaudeVersionUtilsModule;

  if (!mod || typeof mod.getClaudeCliPath !== 'function') {
    throw new Error('Claude version utils module does not export getClaudeCliPath()');
  }

  cachedResolvedClaudeCliPath = mod.getClaudeCliPath();
  return cachedResolvedClaudeCliPath;
}

export function isClaudeCliJavaScriptFile(cliPath: string): boolean {
  const normalized = typeof cliPath === 'string' ? cliPath.trim() : '';
  return normalized.endsWith('.js') || normalized.endsWith('.cjs') || normalized.endsWith('.mjs');
}
