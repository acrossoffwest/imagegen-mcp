import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProviderConfig } from '../config.js';
import { resolveSecret } from '../env.js';
import {
  type EditRequest,
  type GenerateRequest,
  type GeneratedImage,
  type Provider,
  ProviderError,
} from './base.js';

const KNOWN_MODELS = ['sd3', 'sd3-medium', 'sd3-large', 'sd3-large-turbo', 'core', 'ultra'];

const ASPECT_RATIOS = ['16:9', '1:1', '21:9', '2:3', '3:2', '4:5', '5:4', '9:16', '9:21'] as const;

function pickEndpoint(model: string | undefined): string {
  if (!model || model === 'core') return 'core';
  if (model === 'ultra') return 'ultra';
  return 'sd3';
}

function mimeFor(format: string | undefined): string {
  const f = format ?? 'png';
  return `image/${f === 'jpg' ? 'jpeg' : f}`;
}

export class StabilityProvider implements Provider {
  readonly name: string;
  private readonly providerConfig: ProviderConfig;
  private readonly baseUrl: string;

  constructor(name: string, providerConfig: ProviderConfig) {
    this.name = name;
    this.providerConfig = providerConfig;
    this.baseUrl = providerConfig.baseUrl ?? 'https://api.stability.ai/v2beta/stable-image';
  }

  private async authHeader(): Promise<string> {
    const key = await resolveSecret(this.providerConfig.envFile, this.providerConfig.envVar);
    return `Bearer ${key}`;
  }

  async generate(req: GenerateRequest): Promise<GeneratedImage[]> {
    const auth = await this.authHeader();
    const endpoint = pickEndpoint(req.model);
    const url = `${this.baseUrl}/generate/${endpoint}`;

    const form = new FormData();
    form.append('prompt', req.prompt);
    const format = req.output_format ?? 'png';
    form.append('output_format', format);

    const aspect = (req.extras?.aspect_ratio as string) ?? req.size;
    if (aspect && ASPECT_RATIOS.includes(aspect as (typeof ASPECT_RATIOS)[number])) {
      form.append('aspect_ratio', aspect);
    }
    if (req.model && endpoint === 'sd3') form.append('model', req.model);
    if (req.extras) {
      for (const [k, v] of Object.entries(req.extras)) {
        if (k === 'aspect_ratio') continue;
        form.append(k, String(v));
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Accept': 'image/*' },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new ProviderError(this.name, res.status, `generate returned ${res.status}: ${text}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return [{ buffer: buf, mimeType: mimeFor(format), extension: format === 'jpeg' ? 'jpg' : format }];
  }

  async edit(req: EditRequest): Promise<GeneratedImage[]> {
    if (!req.images.length) {
      throw new ProviderError(this.name, undefined, 'edit_image requires at least one input image');
    }
    const auth = await this.authHeader();
    const url = `${this.baseUrl}/edit/inpaint`;
    const form = new FormData();
    form.append('prompt', req.prompt);
    const imgBuf = await readFile(req.images[0]!);
    form.append('image', new Blob([imgBuf], { type: 'image/png' }), path.basename(req.images[0]!));
    if (req.mask) {
      const maskBuf = await readFile(req.mask);
      form.append('mask', new Blob([maskBuf], { type: 'image/png' }), path.basename(req.mask));
    }
    const format = req.output_format ?? 'png';
    form.append('output_format', format);
    if (req.extras) {
      for (const [k, v] of Object.entries(req.extras)) form.append(k, String(v));
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Accept': 'image/*' },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new ProviderError(this.name, res.status, `inpaint returned ${res.status}: ${text}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return [{ buffer: buf, mimeType: mimeFor(format), extension: format === 'jpeg' ? 'jpg' : format }];
  }

  async listModels(): Promise<string[]> {
    return [...KNOWN_MODELS];
  }
}
