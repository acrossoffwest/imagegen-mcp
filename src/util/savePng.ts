import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';

export function expandHome(p: string): string {
  if (p.startsWith('~/')) return path.join(homedir(), p.slice(2));
  if (p === '~') return homedir();
  return p;
}

export async function saveBuffer(outputPath: string, buffer: Buffer): Promise<string> {
  const absolute = path.resolve(expandHome(outputPath));
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, buffer);
  return absolute;
}
