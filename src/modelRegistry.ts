import { ModelRegistry } from './types';

/**
 * Model registry with real pricing data (as of late 2024).
 * Pricing is per 1M tokens; we store per-token for calculation accuracy.
 */
export const MODEL_REGISTRY: ModelRegistry = {
  // OpenAI
  'gpt-4o': {
    provider: 'openai',
    modelId: 'gpt-4o',
    costPerInputToken: 0.0000025,   // $2.50 per 1M input tokens
    costPerOutputToken: 0.000010,   // $10.00 per 1M output tokens
    avgLatencyMs: 1800,
    qualityTier: 'high',
    maxContextTokens: 128000,
  },
  'gpt-4o-mini': {
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    costPerInputToken: 0.00000015,  // $0.15 per 1M input tokens
    costPerOutputToken: 0.0000006,  // $0.60 per 1M output tokens
    avgLatencyMs: 900,
    qualityTier: 'medium',
    maxContextTokens: 128000,
  },
  // Anthropic
  'claude-3-5-sonnet-20241022': {
    provider: 'anthropic',
    modelId: 'claude-3-5-sonnet-20241022',
    costPerInputToken: 0.000003,    // $3.00 per 1M input tokens
    costPerOutputToken: 0.000015,   // $15.00 per 1M output tokens
    avgLatencyMs: 1500,
    qualityTier: 'high',
    maxContextTokens: 200000,
  },
  'claude-haiku-20240307': {
    provider: 'anthropic',
    modelId: 'claude-haiku-20240307',
    costPerInputToken: 0.00000025,  // $0.25 per 1M input tokens
    costPerOutputToken: 0.00000125, // $1.25 per 1M output tokens
    avgLatencyMs: 700,
    qualityTier: 'low',
    maxContextTokens: 200000,
  },
  // Ollama (local - effectively free)
  'llama3.1:8b': {
    provider: 'ollama',
    modelId: 'llama3.1:8b',
    costPerInputToken: 0,
    costPerOutputToken: 0,
    avgLatencyMs: 2000,
    qualityTier: 'low',
    maxContextTokens: 8000,
  },
};

export function getModelConfig(modelId: string) {
  const config = MODEL_REGISTRY[modelId];
  if (!config) throw new Error(`Unknown model: ${modelId}`);
  return config;
}

export function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const config = getModelConfig(modelId);
  return (config.costPerInputToken * inputTokens) + (config.costPerOutputToken * outputTokens);
}

export function calculateSavingsVsGpt4o(modelId: string, inputTokens: number, outputTokens: number): number {
  const actualCost = calculateCost(modelId, inputTokens, outputTokens);
  const gpt4oCost = calculateCost('gpt-4o', inputTokens, outputTokens);
  return gpt4oCost - actualCost;
}
