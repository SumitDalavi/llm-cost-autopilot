import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { isRealOpenAIKey, isRealAnthropicKey } from './credential-mode';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionRequest {
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  mockResponseHint?: string;
  modelId?: string;
}

export interface AICompletionResult {
  content: string;
  provider: 'openai' | 'anthropic' | 'mock';
  model: string;
  latencyMs: number;
  mode: 'live' | 'mock';
  promptTokens: number;
  completionTokens: number;
}

function generateMockResponse(req: AICompletionRequest, modelId?: string): string {
  const model = modelId || 'mock-model';
  return `[Mock Response] Routed to ${model} by Cost Autopilot`;
}

export type AIProvider = {
  complete(req: AICompletionRequest): Promise<AICompletionResult>;
  mode: 'live' | 'mock';
  activeProviders: string[];
};

export function createAIProvider(): AIProvider {
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const hasRealOpenAI = isRealOpenAIKey(openaiKey);
  const hasRealAnthropic = isRealAnthropicKey(anthropicKey);
  const isLive = hasRealOpenAI || hasRealAnthropic;

  const activeProviders: string[] = [];
  if (hasRealOpenAI) activeProviders.push('openai');
  if (hasRealAnthropic) activeProviders.push('anthropic');
  if (!isLive) activeProviders.push('mock');

  async function complete(req: AICompletionRequest): Promise<AICompletionResult> {
    const start = Date.now();

    // 1. Live OpenAI
    if (hasRealOpenAI && openaiKey) {
      try {
        const client = new OpenAI({ apiKey: openaiKey });
        const res = await client.chat.completions.create({
          model: req.modelId || 'gpt-4o-mini',
          messages: req.messages as any,
          max_tokens: req.maxTokens ?? 1024,
          temperature: req.temperature ?? 0.7,
        });

        return {
          content: res.choices[0]?.message?.content ?? '',
          provider: 'openai',
          model: req.modelId || 'gpt-4o-mini',
          latencyMs: Date.now() - start,
          mode: 'live',
          promptTokens: res.usage?.prompt_tokens ?? 0,
          completionTokens: res.usage?.completion_tokens ?? 0,
        };
      } catch (err: any) {
        console.warn('[ai-provider] OpenAI error, falling back:', err.message);
      }
    }

    // 2. Live Anthropic
    if (hasRealAnthropic && anthropicKey) {
      try {
        const client = new Anthropic({ apiKey: anthropicKey });
        const systemMsg = req.messages.find((m) => m.role === 'system');
        const userMsgs = req.messages.filter((m) => m.role !== 'system');

        const res = await client.messages.create({
          model: req.modelId || 'claude-3-5-haiku-20241022',
          max_tokens: req.maxTokens ?? 1024,
          system: systemMsg?.content,
          messages: userMsgs as Anthropic.MessageParam[],
        });

        const block = res.content[0];
        const content = block.type === 'text' ? block.text : '';

        return {
          content,
          provider: 'anthropic',
          model: req.modelId || 'claude-3-5-haiku-20241022',
          latencyMs: Date.now() - start,
          mode: 'live',
          promptTokens: res.usage.input_tokens,
          completionTokens: res.usage.output_tokens,
        };
      } catch (err: any) {
        console.warn('[ai-provider] Anthropic error, falling back:', err.message);
      }
    }

    // 3. Mock Mode — zero credentials needed, deterministic
    await new Promise((r) => setTimeout(r, 20));
    return {
      content: generateMockResponse(req, req.modelId),
      provider: 'mock',
      model: req.modelId || 'mock-v1',
      latencyMs: Date.now() - start,
      mode: 'mock',
      promptTokens: 10,
      completionTokens: 20,
    };
  }

  return {
    complete,
    mode: isLive ? 'live' : 'mock',
    activeProviders,
  };
}

export const aiProvider = createAIProvider();
