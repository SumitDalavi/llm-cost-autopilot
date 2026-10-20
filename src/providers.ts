import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { CompletionRequest, CompletionResponse, Provider } from './types';
import { getModelConfig, calculateCost, calculateSavingsVsGpt4o } from './modelRegistry';
import { isRealOpenAIKey, isRealAnthropicKey } from './lib/credential-mode';
import { v4 as uuidv4 } from 'uuid';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-dummy' });
  }
  return _openai;
}

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'sk-dummy' });
  }
  return _anthropic;
}

/**
 * Unified provider abstraction.
 * Handles OpenAI, Anthropic, and Ollama behind a single interface.
 * Returns a standardized CompletionResponse regardless of provider.
 * Implements Progressive Credential Loading (PCL) — runs mock if keys missing/dummy,
 * auto-promotes to live API if valid keys are provided.
 */
export async function sendRequest(
  request: CompletionRequest,
  modelId: string,
  complexityTier: import('./types').ComplexityTier
): Promise<Omit<CompletionResponse, 'wasEscalated' | 'qualityScore'>> {
  const config = getModelConfig(modelId);
  const startTime = Date.now();

  let content: string;
  let promptTokens: number;
  let completionTokens: number;

  const hasLiveOpenAI = isRealOpenAIKey(process.env.OPENAI_API_KEY);
  const hasLiveAnthropic = isRealAnthropicKey(process.env.ANTHROPIC_API_KEY);

  if (config.provider === 'openai' && !hasLiveOpenAI) {
    // MOCK MODE for OpenAI
    content = `[Mock Response] Routed to ${config.modelId} by Cost Autopilot`;
    promptTokens = 10;
    completionTokens = 20;
    await new Promise(resolve => setTimeout(resolve, 30));
  } else if (config.provider === 'anthropic' && !hasLiveAnthropic) {
    // MOCK MODE for Anthropic
    content = `[Mock Response] Routed to ${config.modelId} by Cost Autopilot`;
    promptTokens = 10;
    completionTokens = 20;
    await new Promise(resolve => setTimeout(resolve, 30));
  } else if (config.provider === 'openai') {
    const response = await getOpenAI().chat.completions.create({
      model: config.modelId,
      messages: request.messages,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.7,
    });
    content = response.choices[0]?.message?.content ?? '';
    promptTokens = response.usage?.prompt_tokens ?? 0;
    completionTokens = response.usage?.completion_tokens ?? 0;

  } else if (config.provider === 'anthropic') {
    const systemMsg = request.messages.find(m => m.role === 'system');
    const userMsgs = request.messages.filter(m => m.role !== 'system');

    const response = await getAnthropic().messages.create({
      model: config.modelId,
      max_tokens: request.maxTokens ?? 1024,
      system: systemMsg?.content,
      messages: userMsgs as Anthropic.MessageParam[],
    });
    const block = response.content[0];
    content = block.type === 'text' ? block.text : '';
    promptTokens = response.usage.input_tokens;
    completionTokens = response.usage.output_tokens;

  } else if (config.provider === 'ollama') {
    const ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    const response = await axios.post(`${ollamaUrl}/api/chat`, {
      model: config.modelId,
      messages: request.messages,
      stream: false,
    }, { timeout: 30000 });
    content = response.data.message?.content ?? '';
    // Ollama doesn't always return token counts
    promptTokens = response.data.prompt_eval_count ?? 0;
    completionTokens = response.data.eval_count ?? 0;

  } else {
    throw new Error(`Unsupported provider: ${config.provider}`);
  }

  const latencyMs = Date.now() - startTime;
  const totalCost = calculateCost(config.modelId, promptTokens, completionTokens);
  const savedVsGpt4o = calculateSavingsVsGpt4o(config.modelId, promptTokens, completionTokens);

  return {
    id: uuidv4(),
    content,
    model: config.modelId,
    provider: config.provider,
    complexityTier,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    cost: {
      inputCost: config.costPerInputToken * promptTokens,
      outputCost: config.costPerOutputToken * completionTokens,
      totalCost,
      savedVsGpt4o,
    },
    latencyMs,
    timestamp: new Date().toISOString(),
  };
}

/**
 * LLM-as-judge quality verifier.
 * Sends the original prompt + response to gpt-4o-mini and asks for a quality score.
 * Returns a score from 0.0 to 1.0.
 */
export async function verifyQuality(
  originalMessages: CompletionRequest['messages'],
  generatedResponse: string
): Promise<number> {
  try {
    if (!isRealOpenAIKey(process.env.OPENAI_API_KEY)) {
      return 0.85; // Deterministic quality score in mock mode
    }

    const userPrompt = originalMessages.filter(m => m.role === 'user').map(m => m.content).join('\n');

    const judgmentResponse = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a strict quality evaluator. Given a user prompt and an AI response, rate the response quality from 0.0 to 1.0.
Return ONLY a JSON object: {"score": 0.85, "reason": "brief explanation"}.
Consider: accuracy, completeness, relevance, and coherence.`
        },
        {
          role: 'user',
          content: `USER PROMPT:\n${userPrompt}\n\nAI RESPONSE:\n${generatedResponse}`
        }
      ],
      max_tokens: 100,
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(judgmentResponse.choices[0]?.message?.content ?? '{"score": 0.5}');
    return Math.min(1.0, Math.max(0.0, Number(result.score)));
  } catch {
    return 0.75; // Default to acceptable score on verifier failure
  }
}
