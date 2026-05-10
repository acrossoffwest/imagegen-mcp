import { z } from 'zod';
import { type Config, pickProvider } from '../config.js';
import { createProvider } from '../providers/index.js';
import { saveBuffer } from '../util/savePng.js';

export const generateImageSchema = z.object({
  prompt: z.string().min(1),
  provider: z.string().optional(),
  model: z.string().optional(),
  size: z.string().optional(),
  quality: z.string().optional(),
  n: z.number().int().min(1).max(10).optional(),
  output_format: z.enum(['png', 'jpeg', 'webp']).optional(),
  output_compression: z.number().int().min(0).max(100).optional(),
  background: z.enum(['transparent', 'opaque', 'auto']).optional(),
  style: z.enum(['vivid', 'natural']).optional(),
  moderation: z.enum(['low', 'auto']).optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
  outputPath: z.string().describe('Absolute path where the first image is saved. Additional images get _N suffix.'),
});

export type GenerateImageInput = z.infer<typeof generateImageSchema>;

export async function generateImage(config: Config, input: GenerateImageInput): Promise<{ paths: string[]; provider: string; model: string | undefined }> {
  const { name, provider } = pickProvider(config, input.provider);
  const inst = createProvider(name, provider);
  const model = input.model ?? config.defaultModel;
  const results = await inst.generate({
    prompt: input.prompt,
    model,
    size: input.size,
    quality: input.quality,
    n: input.n,
    output_format: input.output_format,
    output_compression: input.output_compression,
    background: input.background,
    style: input.style,
    moderation: input.moderation,
    extras: input.extras,
  });
  const paths: string[] = [];
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i]!;
    const out = results.length === 1
      ? input.outputPath
      : input.outputPath.replace(/(\.[^.]+)?$/, (m) => `_${i + 1}${m ?? ''}`);
    const saved = await saveBuffer(out, r.buffer);
    paths.push(saved);
  }
  return { paths, provider: name, model };
}
