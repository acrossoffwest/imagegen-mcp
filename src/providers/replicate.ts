import type { ProviderConfig } from '../config.js';
import { resolveSecret } from '../env.js';
import {
  type GenerateRequest,
  type GeneratedImage,
  type Provider,
  ProviderError,
} from './base.js';

const KNOWN_MODELS = [
  'black-forest-labs/flux-1.1-pro',
  'black-forest-labs/flux-1.1-pro-ultra',
  'black-forest-labs/flux-schnell',
  'stability-ai/sdxl',
  'stability-ai/stable-diffusion-3.5-large',
  'ideogram-ai/ideogram-v2',
  'recraft-ai/recraft-v3',
];

type Prediction = {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[] | null;
  error?: string | null;
  urls?: { get?: string };
};

function detectExtension(url: string): string {
  const m = /\.(png|jpg|jpeg|webp)(\?|$)/i.exec(url);
  return m && m[1] ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
}

function mimeFor(ext: string): string {
  return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
}

export class ReplicateProvider implements Provider {
  readonly name: string;
  private readonly providerConfig: ProviderConfig;
  private readonly baseUrl: string;

  constructor(name: string, providerConfig: ProviderConfig) {
    this.name = name;
    this.providerConfig = providerConfig;
    this.baseUrl = providerConfig.baseUrl ?? 'https://api.replicate.com/v1';
  }

  private async authHeader(): Promise<string> {
    const key = await resolveSecret(this.providerConfig.envFile, this.providerConfig.envVar);
    return `Token ${key}`;
  }

  async generate(req: GenerateRequest): Promise<GeneratedImage[]> {
    if (!req.model) throw new ProviderError(this.name, undefined, 'replicate requires model in "owner/name" or "owner/name:version" format');
    const auth = await this.authHeader();
    const input: Record<string, unknown> = { prompt: req.prompt, ...(req.extras ?? {}) };
    if (req.size && !('aspect_ratio' in input)) input.aspect_ratio = req.size;
    if (req.output_format && !('output_format' in input)) input.output_format = req.output_format;

    const [owner, rest] = req.model.split('/');
    if (!owner || !rest) throw new ProviderError(this.name, undefined, `invalid replicate model identifier "${req.model}"`);
    const [name, version] = rest.split(':');
    const usePredictions = Boolean(version);
    const url = usePredictions
      ? `${this.baseUrl}/predictions`
      : `${this.baseUrl}/models/${owner}/${name}/predictions`;
    const body = usePredictions ? { version, input } : { input };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new ProviderError(this.name, res.status, `predictions returned ${res.status}: ${text}`);
    }
    let pred = (await res.json()) as Prediction;
    while (pred.status === 'starting' || pred.status === 'processing') {
      await new Promise((r) => setTimeout(r, 1500));
      const getUrl = pred.urls?.get ?? `${this.baseUrl}/predictions/${pred.id}`;
      const poll = await fetch(getUrl, { headers: { 'Authorization': auth } });
      if (!poll.ok) {
        const text = await poll.text();
        throw new ProviderError(this.name, poll.status, `polling returned ${poll.status}: ${text}`);
      }
      pred = (await poll.json()) as Prediction;
    }
    if (pred.status !== 'succeeded') {
      throw new ProviderError(this.name, undefined, `prediction ${pred.status}: ${pred.error ?? 'unknown error'}`);
    }
    const outputs = Array.isArray(pred.output) ? pred.output : pred.output ? [pred.output] : [];
    if (!outputs.length) {
      throw new ProviderError(this.name, undefined, 'prediction succeeded but produced no output URLs');
    }
    const results: GeneratedImage[] = [];
    for (const out of outputs) {
      const dl = await fetch(out);
      if (!dl.ok) throw new ProviderError(this.name, dl.status, `failed to download image at ${out}`);
      const ext = detectExtension(out);
      results.push({
        buffer: Buffer.from(await dl.arrayBuffer()),
        mimeType: mimeFor(ext),
        extension: ext,
      });
    }
    return results;
  }

  async listModels(): Promise<string[]> {
    return [...KNOWN_MODELS];
  }
}
