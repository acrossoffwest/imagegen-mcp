import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const ProviderSchema = z.object({
  type: z.enum(['openai', 'stability', 'replicate']),
  envFile: z.string().optional(),
  envVar: z.string(),
  baseUrl: z.string().optional(),
});

const ConfigSchema = z.object({
  providers: z.record(z.string(), ProviderSchema),
  defaultProvider: z.string().optional(),
  defaultModel: z.string().optional(),
});

export type ProviderConfig = z.infer<typeof ProviderSchema>;
export type Config = z.infer<typeof ConfigSchema>;

function expandHome(p: string): string {
  if (p.startsWith('~/')) return path.join(homedir(), p.slice(2));
  if (p === '~') return homedir();
  return p;
}

function defaultConfigPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg ?? path.join(homedir(), '.config');
  return path.join(base, 'imagegen-mcp', 'config.json');
}

export async function loadConfig(): Promise<Config> {
  const explicit = process.env.IMAGEGEN_MCP_CONFIG;
  const target = explicit ? expandHome(explicit) : defaultConfigPath();

  let raw: string;
  try {
    raw = await readFile(target, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      throw new Error(
        `imagegen-mcp config not found at ${target}. ` +
          `Set IMAGEGEN_MCP_CONFIG env var or create the file. See config.example.json in the repo for the schema.`,
      );
    }
    throw err;
  }

  const parsed = ConfigSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`Invalid imagegen-mcp config at ${target}: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function pickProvider(config: Config, requested: string | undefined): { name: string; provider: ProviderConfig } {
  const name = requested ?? config.defaultProvider ?? Object.keys(config.providers)[0];
  if (!name) throw new Error('No providers configured.');
  const provider = config.providers[name];
  if (!provider) {
    const known = Object.keys(config.providers).join(', ') || '(none)';
    throw new Error(`Provider "${name}" not found. Known providers: ${known}`);
  }
  return { name, provider };
}
