import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

function expandHome(p: string): string {
  if (p.startsWith('~/')) return path.join(homedir(), p.slice(2));
  if (p === '~') return homedir();
  return p;
}

const cache = new Map<string, Record<string, string>>();

async function parseEnvFile(filePath: string): Promise<Record<string, string>> {
  const absolute = expandHome(filePath);
  const cached = cache.get(absolute);
  if (cached) return cached;
  const raw = await readFile(absolute, 'utf8');
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  cache.set(absolute, out);
  return out;
}

export async function resolveSecret(envFile: string | undefined, envVar: string): Promise<string> {
  if (envFile) {
    const parsed = await parseEnvFile(envFile).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return null;
      throw err;
    });
    if (parsed && parsed[envVar]) return parsed[envVar];
  }
  const fromProcess = process.env[envVar];
  if (fromProcess) return fromProcess;
  throw new Error(
    `Secret ${envVar} not found. Looked in envFile=${envFile ?? '(none)'} and process.env. Add it to the env file or export it before launching the server.`,
  );
}
