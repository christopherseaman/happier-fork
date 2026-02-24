/**
 * Runtime utilities - minimal, focused, testable
 * Single responsibility: detect current JavaScript runtime
 */

// Type safety with explicit union
export type Runtime = 'node' | 'bun' | 'deno' | 'unknown';

// Cache result after first detection (performance optimization)
let cachedRuntime: Runtime | null = null;

/**
 * Detect current runtime with fallback chain
 * Most reliable detection first, falling back to less reliable methods
 */
export function getRuntime(): Runtime {
    if (cachedRuntime) return cachedRuntime;

    // Method 1: Global runtime objects (most reliable)
    if (typeof (globalThis as any).Bun !== 'undefined') {
        cachedRuntime = 'bun';
        return cachedRuntime;
    }

    if (typeof (globalThis as any).Deno !== 'undefined') {
        cachedRuntime = 'deno';
        return cachedRuntime;
    }

    // Method 2: Process versions (fallback)
    if (process?.versions?.bun) {
        cachedRuntime = 'bun';
        return cachedRuntime;
    }

    if (process?.versions?.deno) {
        cachedRuntime = 'deno';
        return cachedRuntime;
    }

    if (process?.versions?.node) {
        cachedRuntime = 'node';
        return cachedRuntime;
    }

    cachedRuntime = 'unknown';
    return cachedRuntime;
}

// Convenience predicates - single responsibility each
export const isBun = (): boolean => getRuntime() === 'bun';
export const isNode = (): boolean => getRuntime() === 'node';
export const isDeno = (): boolean => getRuntime() === 'deno';

// Compiled binary detection -- cached since it never changes during a process lifetime
let cachedIsBunCompiledBinary: boolean | null = null;

/**
 * Detect whether the current process is a Bun-compiled single-file binary.
 *
 * In compiled binaries, Bun injects the bundled script as process.argv[1]
 * with a virtual `/$bunfs/root/` prefix. This is the most reliable signal
 * because process.execPath may report "bun" (the embedded runtime name)
 * rather than the actual binary path in some Bun versions.
 */
export function isBunCompiledBinary(): boolean {
    if (cachedIsBunCompiledBinary !== null) return cachedIsBunCompiledBinary;
    if (!isBun()) {
        cachedIsBunCompiledBinary = false;
        return false;
    }
    const bunGlobal = (globalThis as any).Bun;
    const mainModule: string = (bunGlobal?.main ?? '').replaceAll('\\', '/');
    cachedIsBunCompiledBinary = mainModule.startsWith('/$bunfs/root/');
    return cachedIsBunCompiledBinary;
}

/**
 * Get the on-disk path to the compiled binary, or null if not a compiled binary.
 * Falls back through process.argv[0] → process.execPath, preferring whichever
 * is not a bare runtime name like "bun".
 */
export function getCompiledBinaryPath(): string | null {
    if (!isBunCompiledBinary()) return null;
    const argv0 = (process.argv[0] ?? '').trim();
    if (argv0 && argv0 !== 'bun' && argv0 !== 'bun.exe') return argv0;
    const execPath = (process.execPath ?? '').trim();
    if (execPath && execPath !== 'bun' && execPath !== 'bun.exe') return execPath;
    return null;
}