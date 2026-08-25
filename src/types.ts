export type ComplexityTier = 'tier1' | 'tier2' | 'tier3';
export type Provider = 'openai' | 'anthropic' | 'ollama';
export type QualityTierLabel = 'high' | 'medium' | 'low';

export interface ModelConfig {
  provider: Provider;
  modelId: string;
  costPerInputToken: number;   // USD per token
  costPerOutputToken: number;  // USD per token
  avgLatencyMs: number;
  qualityTier: QualityTierLabel;
  maxContextTokens: number;
}

export interface ModelRegistry {
  [key: string]: ModelConfig;
}

export interface RoutingConfig {
  tiers: {
    tier1: { label: string; description: string; primary: { provider: Provider; modelId: string }; fallback: { provider: Provider; modelId: string } };
    tier2: { label: string; description: string; primary: { provider: Provider; modelId: string }; fallback: { provider: Provider; modelId: string } };
    tier3: { label: string; description: string; primary: { provider: Provider; modelId: string }; fallback: { provider: Provider; modelId: string } };
  };
  qualityThreshold: number;
  autoEscalation: boolean;
}

export interface CompletionRequest {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface CompletionResponse {
  id: string;
  content: string;
  model: string;
  provider: Provider;
  complexityTier: ComplexityTier;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost: {
    inputCost: number;
    outputCost: number;
    totalCost: number;
    savedVsGpt4o: number;
  };
  latencyMs: number;
  wasEscalated: boolean;
  qualityScore?: number;
  timestamp: string;
}

export interface RequestLog {
  id: string;
  promptHash: string;
  promptPreview: string;
  complexityTier: ComplexityTier;
  routedModel: string;
  provider: Provider;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latencyMs: number;
  qualityScore: number | null;
  wasEscalated: boolean;
  escalatedToModel: string | null;
  timestamp: string;
}

export interface StatsResponse {
  totalRequests: number;
  totalCost: number;
  totalCostIfAllGpt4o: number;
  savedAmount: number;
  savingsPercentage: number;
  routingDistribution: Record<string, number>;
  escalationRate: number;
  avgQualityScore: number;
  avgLatencyMs: number;
}
