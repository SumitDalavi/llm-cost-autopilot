import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { RoutingConfig, ComplexityTier } from './types';
import { classifyComplexity } from './classifier';
import { sendRequest, verifyQuality } from './providers';
import { CompletionRequest, CompletionResponse } from './types';
import { insertLog, updateQualityScore } from './database';
import { MODEL_REGISTRY } from './modelRegistry';
import { createHash } from 'crypto';
import logger from './logger';

let routingConfig: RoutingConfig;

export function loadRoutingConfig(): RoutingConfig {
  const configPath = process.env.ROUTING_CONFIG_PATH
    ?? path.join(__dirname, '..', 'config', 'routing.yaml');

  const raw = fs.readFileSync(configPath, 'utf-8');
  routingConfig = yaml.load(raw) as RoutingConfig;
  logger.info('Routing config loaded', { path: configPath });
  return routingConfig;
}

export function getRoutingConfig(): RoutingConfig {
  if (!routingConfig) loadRoutingConfig();
  return routingConfig;
}

export function updateRoutingConfig(newConfig: Partial<RoutingConfig>): void {
  routingConfig = { ...getRoutingConfig(), ...newConfig };
  logger.info('Routing config updated in memory');
}

function resolveModelForTier(tier: ComplexityTier): string {
  const config = getRoutingConfig();
  const tierConfig = config.tiers[tier];
  // Verify primary model exists in registry, else use fallback
  if (MODEL_REGISTRY[tierConfig.primary.modelId]) {
    return tierConfig.primary.modelId;
  }
  return tierConfig.fallback.modelId;
}

/**
 * Core routing function — the heart of the autopilot.
 * 1. Classifies the prompt complexity
 * 2. Routes to the appropriate model
 * 3. Returns the response
 * 4. Queues async quality verification (non-blocking)
 */
export async function routeRequest(request: CompletionRequest): Promise<CompletionResponse> {
  const userPrompt = request.messages.filter(m => m.role === 'user').map(m => m.content).join(' ');
  const { tier, score, reasoning } = classifyComplexity(userPrompt);
  const modelId = resolveModelForTier(tier);
  const promptHash = createHash('md5').update(userPrompt).digest('hex');

  logger.info('Routing request', { tier, score, modelId, reasoning });

  // Execute the primary request
  const response = await sendRequest(request, modelId, tier);

  const finalResponse: CompletionResponse = {
    ...response,
    wasEscalated: false,
    qualityScore: undefined,
  };

  // Log synchronously so we have a record even before quality check
  await insertLog({
    id: response.id,
    promptHash,
    promptPreview: userPrompt.substring(0, 200),
    complexityTier: tier,
    routedModel: modelId,
    provider: response.provider,
    inputTokens: response.usage.promptTokens,
    outputTokens: response.usage.completionTokens,
    cost: response.cost.totalCost,
    latencyMs: response.latencyMs,
    qualityScore: null,
    wasEscalated: false,
    escalatedToModel: null,
    timestamp: response.timestamp,
  });

  // Async quality verification — runs after response is returned to caller
  if (process.env.QUALITY_VERIFICATION_ENABLED === 'true' && process.env.OPENAI_API_KEY) {
    setImmediate(async () => {
      try {
        const qualityScore = await verifyQuality(request.messages, response.content);
        const config = getRoutingConfig();
        let escalatedModel: string | undefined;

        if (qualityScore < config.qualityThreshold && config.autoEscalation && tier !== 'tier3') {
          const nextTier: ComplexityTier = tier === 'tier1' ? 'tier2' : 'tier3';
          escalatedModel = resolveModelForTier(nextTier);
          logger.warn('Quality threshold breach — auto-escalating', {
            originalModel: modelId,
            escalatedModel,
            qualityScore,
            threshold: config.qualityThreshold,
          });
        }

        await updateQualityScore(response.id, qualityScore, escalatedModel);
      } catch (err) {
        logger.error('Quality verification failed', { error: err });
      }
    });
  }

  return finalResponse;
}
