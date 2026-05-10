import { z } from 'zod';
import { type Config, pickProvider } from '../config.js';
import { createProvider } from '../providers/index.js';
import { saveBuffer } from '../util/savePng.js';

export const editImageSchema = z.object({
  prompt: z.string().min(1),
  images: z.array(z.string()).min(1).describe('Absolute paths to input images.'),
  mask: z.string().optional().describe('Optional absolute path to a mask PNG; transparent pixels mark editable regions.'),
  provider: z.string().optional(),
  model: z.string().optional(),
  size: z.string().optional(),
  quality: z.string().optional(),
  n: z.number().int().min(1).max(10).optional(),
  output_format: z.enum(['png', 'jpeg', 'webp']).optional(),
  output_compression: z.number().int().min(0).max(100).optional(),
  background: z.enum(['transparent', 'opaque', 'auto']).optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
  outputPath: z.string(),
});

export type EditImageInput = z.infer<typeof editImageSchema>;

export async function editImage(config: Config, input: EditImageInput): Promise<{ paths: string[]; provider: string; model: string | undefined }> {
  const { name, provider } = pickProvider(config, input.provider);
  const inst = createProvider(name, provider);
  if (!inst.edit) {
    throw new Error(`Provider "${name}" (type ${provider.type}) does not support image editing.`);
  }
  const model = input.model ?? config.defaultModel;
  const results = await inst.edit({
    prompt: input.prompt,
    images: input.images,
    mask: input.mask,
    model,
    size: input.size,
    quality: input.quality,
    n: input.n,
    output_format: input.output_format,
    output_compression: input.output_compression,
    background: input.background,
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
