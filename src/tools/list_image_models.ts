import { z } from 'zod';
import type { Config } from '../config.js';
import { createProvider } from '../providers/index.js';

export const listImageModelsSchema = z.object({
  provider: z.string().optional().describe('When omitted, lists models across all configured providers.'),
});

export type ListImageModelsInput = z.infer<typeof listImageModelsSchema>;

export async function listImageModels(config: Config, input: ListImageModelsInput): Promise<Record<string, string[] | { error: string }>> {
  const targets = input.provider ? [input.provider] : Object.keys(config.providers);
  const out: Record<string, string[] | { error: string }> = {};
  for (const name of targets) {
    const cfg = config.providers[name];
    if (!cfg) {
      out[name] = { error: `Provider "${name}" not configured` };
      continue;
    }
    const inst = createProvider(name, cfg);
    if (!inst.listModels) {
      out[name] = { error: `Provider "${name}" (type ${cfg.type}) does not implement listModels` };
      continue;
    }
    try {
      out[name] = await inst.listModels();
    } catch (err) {
      out[name] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  return out;
}
