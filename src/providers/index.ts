import type { ProviderConfig } from '../config.js';
import { OpenAIProvider } from './openai.js';
import { ReplicateProvider } from './replicate.js';
import { StabilityProvider } from './stability.js';
import type { Provider } from './base.js';

export function createProvider(name: string, config: ProviderConfig): Provider {
  switch (config.type) {
    case 'openai':
      return new OpenAIProvider(name, config);
    case 'stability':
      return new StabilityProvider(name, config);
    case 'replicate':
      return new ReplicateProvider(name, config);
    default: {
      const exhaustive: never = config.type;
      throw new Error(`Unsupported provider type: ${String(exhaustive)}`);
    }
  }
}
