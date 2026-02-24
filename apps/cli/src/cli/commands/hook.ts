/**
 * Internal _hook command — replaces CJS hook forwarder scripts for compiled binary mode.
 *
 * Claude invokes these as hook commands. They read JSON from stdin and forward
 * it to the local happier HTTP server. Two subcommands:
 *
 *   happier _hook session <port>
 *   happier _hook permission <port> [secret]
 */

import { request } from 'node:http';
import type { CommandContext } from '@/cli/commandRegistry';

function readStdin(): Promise<Buffer> {
    return new Promise((resolve) => {
        const chunks: Buffer[] = [];
        process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
        process.stdin.on('end', () => resolve(Buffer.concat(chunks)));
        process.stdin.resume();
    });
}

function httpPost(opts: { port: number; path: string; body: Buffer; headers?: Record<string, string> }): Promise<string> {
    return new Promise((resolve) => {
        const req = request(
            {
                host: '127.0.0.1',
                port: opts.port,
                method: 'POST',
                path: opts.path,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': opts.body.length,
                    ...opts.headers,
                },
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
                res.on('end', () => {
                    const statusCode = res.statusCode ?? 0;
                    if (statusCode < 200 || statusCode >= 300) {
                        resolve('');
                        return;
                    }
                    resolve(Buffer.concat(chunks).toString('utf8').trim());
                });
            },
        );
        req.on('error', () => resolve(''));
        req.end(opts.body);
    });
}

export async function handleHookCliCommand(context: CommandContext): Promise<void> {
    const [hookType, portStr, ...rest] = context.args;
    const port = parseInt(portStr, 10);

    if (hookType === 'session') {
        if (!port || isNaN(port)) process.exit(1);
        const body = await readStdin();
        await httpPost({ port, path: '/hook/session-start', body });
        return;
    }

    if (hookType === 'permission') {
        const fallback = JSON.stringify({
            continue: true,
            suppressOutput: true,
            hookSpecificOutput: { hookEventName: 'PermissionRequest' },
        });

        if (!port || isNaN(port)) {
            process.stdout.write(fallback);
            return;
        }

        const secret = typeof rest[0] === 'string' ? rest[0] : '';
        const body = await readStdin();
        const headers: Record<string, string> = {};
        if (secret.length > 0) headers['x-happier-hook-secret'] = secret;

        const response = await httpPost({ port, path: '/hook/permission-request', body, headers });
        process.stdout.write(response || fallback);
        return;
    }

    console.error(`Unknown hook type: ${hookType}`);
    process.exit(1);
}
