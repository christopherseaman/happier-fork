import { delimiter, resolve } from 'node:path';

import { projectPath } from '@/projectPath';
import { isBunCompiledBinary } from '@/utils/runtime';

export function buildCodexAcpEnvOverrides(params?: {
  baseEnv?: { PATH?: string };
  projectDir?: string;
}): { PATH: string } {
  const basePath = (params?.baseEnv ? params.baseEnv.PATH ?? '' : process.env.PATH ?? '').trim();

  // In compiled binary mode the scripts/shims directory doesn't exist on disk.
  if (isBunCompiledBinary() && !params?.projectDir) {
    return { PATH: basePath };
  }

  const projectDir = params?.projectDir ?? projectPath();
  const shimsDir = resolve(projectDir, 'scripts', 'shims');

  if (!basePath) return { PATH: shimsDir };
  return { PATH: `${shimsDir}${delimiter}${basePath}` };
}
