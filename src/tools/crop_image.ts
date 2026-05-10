import sharp from 'sharp';
import { z } from 'zod';
import { expandHome, saveBuffer } from '../util/savePng.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const GRAVITY = ['center', 'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'] as const;

export const cropImageSchema = z.object({
  inputPath: z.string(),
  outputPath: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mode: z.enum(['cover', 'contain', 'fill']).default('cover'),
  gravity: z.enum(GRAVITY).default('center'),
  format: z.enum(['png', 'jpeg', 'webp']).optional(),
  quality: z.number().int().min(1).max(100).optional(),
});

export type CropImageInput = z.infer<typeof cropImageSchema>;

export async function cropImage(input: CropImageInput): Promise<{ outputPath: string; width: number; height: number; format: string }> {
  const buf = await readFile(path.resolve(expandHome(input.inputPath)));
  let pipeline = sharp(buf);

  switch (input.mode) {
    case 'cover':
      pipeline = pipeline.resize(input.width, input.height, { fit: 'cover', position: input.gravity });
      break;
    case 'contain':
      pipeline = pipeline.resize(input.width, input.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
      break;
    case 'fill':
      pipeline = pipeline.resize(input.width, input.height, { fit: 'fill' });
      break;
  }

  let format: string;
  if (input.format) {
    format = input.format === 'jpeg' ? 'jpeg' : input.format;
  } else {
    const ext = path.extname(input.outputPath).toLowerCase().slice(1);
    format = ext === 'jpg' ? 'jpeg' : ext || 'png';
  }

  if (format === 'jpeg') {
    pipeline = pipeline.jpeg(input.quality ? { quality: input.quality } : undefined);
  } else if (format === 'webp') {
    pipeline = pipeline.webp(input.quality ? { quality: input.quality } : undefined);
  } else {
    pipeline = pipeline.png();
  }

  const out = await pipeline.toBuffer();
  const saved = await saveBuffer(input.outputPath, out);
  return { outputPath: saved, width: input.width, height: input.height, format };
}
