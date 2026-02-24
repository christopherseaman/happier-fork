/**
 * Low-level difftastic wrapper - just arguments in, string out
 */

import { spawn, execSync } from 'child_process';
import { join, resolve } from 'path';
import { platform, arch } from 'os';
import { projectPath } from '@/projectPath';
import { isBunCompiledBinary } from '@/utils/runtime';

export interface DifftasticResult {
    exitCode: number
    stdout: string
    stderr: string
}

export interface DifftasticOptions {
    cwd?: string
}

/**
 * Get the platform-specific binary path
 */
function findSystemDifft(): string | null {
    try {
        const cmd = process.platform === 'win32' ? 'where difft' : 'which difft';
        return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim().split(/\r?\n/)[0]?.trim() || null;
    } catch {
        return null;
    }
}

function getBinaryPath(): string {
    if (isBunCompiledBinary()) {
        const systemPath = findSystemDifft();
        if (systemPath) return systemPath;
        // Fall through to bundled path — will fail but gives a clear error
    }
    const platformName = platform();
    const binaryName = platformName === 'win32' ? 'difft.exe' : 'difft';
    return resolve(join(projectPath(), 'tools', 'unpacked', binaryName));
}

/**
 * Run difftastic with the given arguments
 * @param args - Array of command line arguments to pass to difftastic
 * @param options - Options for difftastic execution
 * @returns Promise with exit code, stdout and stderr
 */
export function run(args: string[], options?: DifftasticOptions): Promise<DifftasticResult> {
    const binaryPath = getBinaryPath();
    
    return new Promise((resolve, reject) => {
        const child = spawn(binaryPath, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: options?.cwd,
            env: {
                ...process.env,
                // Force color output when needed
                FORCE_COLOR: '1'
            },
            windowsHide: true,
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            resolve({
                exitCode: code || 0,
                stdout,
                stderr
            });
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
}