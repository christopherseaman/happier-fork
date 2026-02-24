/**
 * Low-level ripgrep wrapper - just arguments in, string out
 */

import { spawn, execSync } from 'child_process';
import { projectPath } from '@/projectPath';
import { join, resolve } from 'path';
import { isBunCompiledBinary } from '@/utils/runtime';

export interface RipgrepResult {
    exitCode: number
    stdout: string
    stderr: string
}

export interface RipgrepOptions {
    cwd?: string
}

/**
 * Run ripgrep with the given arguments
 * @param args - Array of command line arguments to pass to ripgrep
 * @param options - Options for ripgrep execution
 * @returns Promise with exit code, stdout and stderr
 */
function findSystemRipgrep(): string | null {
    try {
        const cmd = process.platform === 'win32' ? 'where rg' : 'which rg';
        return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim().split(/\r?\n/)[0]?.trim() || null;
    } catch {
        return null;
    }
}

export function run(args: string[], options?: RipgrepOptions): Promise<RipgrepResult> {
    // Compiled binary: use system rg directly (bundled launcher script not available)
    if (isBunCompiledBinary()) {
        const rgPath = findSystemRipgrep();
        if (!rgPath) {
            return Promise.resolve({ exitCode: 1, stdout: '', stderr: 'ripgrep (rg) not found in PATH' });
        }
        return new Promise((resolve, reject) => {
            const child = spawn(rgPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: options?.cwd,
                windowsHide: true,
            });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (data) => { stdout += data.toString(); });
            child.stderr.on('data', (data) => { stderr += data.toString(); });
            child.on('close', (code) => resolve({ exitCode: code || 0, stdout, stderr }));
            child.on('error', (err) => reject(err));
        });
    }

    const RUNNER_PATH = resolve(join(projectPath(), 'scripts', 'ripgrep_launcher.cjs'));
    return new Promise((resolve, reject) => {
        const child = spawn('node', [RUNNER_PATH, JSON.stringify(args)], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: options?.cwd,
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