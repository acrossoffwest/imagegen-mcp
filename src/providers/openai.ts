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

const KNOWN_MODELS_HINT = ['gpt-image-1.5', 'gpt-image-1', 'dall-e-3', 'dall-e-2'];

function extensionFor(format: string | undefined): string {
  return format === 'jpeg' ? 'jpg' : format ?? 'png';
}

function mimeFor(format: string | undefined): string {
  return `image/${format === 'jpg' ? 'jpeg' : format ?? 'png'}`;
}

function decodeB64(b64: string): Buffer {
  return Buffer.from(b64, 'base64');
}

export class OpenAIProvider implements Provider {
  readonly name: string;
  private readonly providerConfig: ProviderConfig;
  private readonly baseUrl: string;

  constructor(name: string, providerConfig: ProviderConfig) {
    this.name = name;
    this.providerConfig = providerConfig;
    this.baseUrl = providerConfig.baseUrl ?? 'https://api.openai.com/v1';
  }

  private async authHeader(): Promise<string> {
    const key = await resolveSecret(this.providerConfig.envFile, this.providerConfig.envVar);
    return `Bearer ${key}`;
  }

  async generate(req: GenerateRequest): Promise<GeneratedImage[]> {
    const auth = await this.authHeader();
    const body: Record<string, unknown> = {
      model: req.model,
      prompt: req.prompt,
      n: req.n ?? 1,
    };
    if (req.size) body.size = req.size;
    if (req.quality) body.quality = req.quality;
    if (req.output_format) body.output_format = req.output_format;
    if (typeof req.output_compression === 'number') body.output_compression = req.output_compression;
    if (req.background) body.background = req.background;
    if (req.style) body.style = req.style;
    if (req.moderation) body.moderation = req.moderation;
    if (req.extras) Object.assign(body, req.extras);

    if (req.model && /^dall-e/i.test(req.model)) {
      body.response_format = body.response_format ?? 'b64_json';
    }

    const url = `${this.baseUrl}/images/generations`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.parseResponse(res, req.output_format);
  }

  async edit(req: EditRequest): Promise<GeneratedImage[]> {
    const auth = await this.authHeader();
    const form = new FormData();
    if (req.model) form.append('model', req.model);
    form.append('prompt', req.prompt);
    if (req.size) form.append('size', req.size);
    if (req.quality) form.append('quality', req.quality);
    if (req.background) form.append('background', req.background);
    if (req.output_format) form.append('output_format', req.output_format);
    if (typeof req.output_compression === 'number') form.append('output_compression', String(req.output_compression));
    form.append('n', String(req.n ?? 1));
    if (req.extras) {
      for (const [k, v] of Object.entries(req.extras)) form.append(k, String(v));
    }

    if (!req.images.length) {
      throw new ProviderError(this.name, undefined, 'edit_image requires at least one input image');
    }

    for (const imgPath of req.images) {
      const buf = await readFile(imgPath);
      const filename = path.basename(imgPath);
      form.append('image[]', new Blob([buf], { type: 'image/png' }), filename);
    }
    if (req.mask) {
      const buf = await readFile(req.mask);
      form.append('mask', new Blob([buf], { type: 'image/png' }), path.basename(req.mask));
    }

    if (req.model && /^dall-e/i.test(req.model)) {
      form.append('response_format', 'b64_json');
    }

    const url = `${this.baseUrl}/images/edits`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': auth },
      body: form,
    });
    return this.parseResponse(res, req.output_format);
  }

  async listModels(): Promise<string[]> {
    const auth = await this.authHeader();
    const url = `${this.baseUrl}/models`;
    const res = await fetch(url, { headers: { 'Authorization': auth } });
    if (!res.ok) {
      const text = await res.text();
      throw new ProviderError(this.name, res.status, `models endpoint returned ${res.status}: ${text}`);
    }
    const json = (await res.json()) as { data?: { id?: string }[] };
    const ids = (json.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string');
    const filtered = ids.filter((id) => /image|dall/i.test(id));
    return filtered.length ? filtered : ids.filter((id) => KNOWN_MODELS_HINT.includes(id));
  }

  private async parseResponse(res: Response, output_format: string | undefined): Promise<GeneratedImage[]> {
    if (!res.ok) {
      const text = await res.text();
      throw new ProviderError(this.name, res.status, `images endpoint returned ${res.status}: ${text}`);
    }
    const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const items = json.data ?? [];
    if (!items.length) {
      throw new ProviderError(this.name, undefined, 'response had no image data');
    }
    const ext = extensionFor(output_format);
    const mime = mimeFor(ext);
    const out: GeneratedImage[] = [];
    for (const item of items) {
      let buffer: Buffer;
      if (item.b64_json) {
        buffer = decodeB64(item.b64_json);
      } else if (item.url) {
        const dl = await fetch(item.url);
        if (!dl.ok) throw new ProviderError(this.name, dl.status, `failed to download image at ${item.url}`);
        buffer = Buffer.from(await dl.arrayBuffer());
      } else {
        throw new ProviderError(this.name, undefined, 'image item had no b64_json or url');
      }
      out.push({ buffer, mimeType: mime, extension: ext });
    }
    return out;
  }
}
