export type GeneratedImage = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
};

export type GenerateRequest = {
  model?: string;
  prompt: string;
  size?: string;
  quality?: string;
  n?: number;
  output_format?: 'png' | 'jpeg' | 'webp';
  output_compression?: number;
  background?: 'transparent' | 'opaque' | 'auto';
  style?: 'vivid' | 'natural';
  moderation?: 'low' | 'auto';
  extras?: Record<string, unknown>;
};

export type EditRequest = GenerateRequest & {
  images: string[];
  mask?: string;
};

export interface Provider {
  readonly name: string;
  generate(req: GenerateRequest): Promise<GeneratedImage[]>;
  edit?(req: EditRequest): Promise<GeneratedImage[]>;
  listModels?(): Promise<string[]>;
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: number | undefined,
    message: string,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
  }
}
