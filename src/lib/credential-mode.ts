export type ProviderMode = 'mock' | 'live';

export interface CredentialStatus {
  database: ProviderMode;
  redis: ProviderMode;
  openai: ProviderMode;
  anthropic: ProviderMode;
}

export function isRealPostgresUrl(url?: string): boolean {
  return !!url && (url.startsWith('postgres://') || url.startsWith('postgresql://'));
}

export function isRealRedisUrl(url?: string): boolean {
  return !!url && (url.startsWith('redis://') || url.startsWith('rediss://'));
}

export function isRealOpenAIKey(key?: string): boolean {
  return !!key && key.startsWith('sk-') && !key.startsWith('sk-dummy') && key.length >= 20;
}

export function isRealAnthropicKey(key?: string): boolean {
  return !!key && key.startsWith('sk-ant-') && !key.startsWith('sk-dummy');
}

export function detectCredentialStatus(): CredentialStatus {
  return {
    database: isRealPostgresUrl(process.env.DATABASE_URL) ? 'live' : 'mock',
    redis: isRealRedisUrl(process.env.REDIS_URL) ? 'live' : 'mock',
    openai: isRealOpenAIKey(process.env.OPENAI_API_KEY) ? 'live' : 'mock',
    anthropic: isRealAnthropicKey(process.env.ANTHROPIC_API_KEY) ? 'live' : 'mock',
  };
}

export const credentialStatus = detectCredentialStatus();
