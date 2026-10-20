import { dbAdapter } from '../src/lib/db-factory';
import { getDbMode } from '../src/database';
import { sendRequest } from '../src/providers';
import { isRealOpenAIKey, isRealPostgresUrl } from '../src/lib/credential-mode';

describe('Progressive Credential Loading (PCL) Tests', () => {
  it('defaults to mock mode when no external credentials provided', () => {
    expect(getDbMode()).toBe('mock');
    expect(dbAdapter.mode).toBe('mock');
  });

  it('correctly classifies mock vs live credentials', () => {
    expect(isRealOpenAIKey(undefined)).toBe(false);
    expect(isRealOpenAIKey('sk-dummy-12345')).toBe(false);
    expect(isRealOpenAIKey('sk-real-test-key-that-is-long-enough-for-live')).toBe(true);

    expect(isRealPostgresUrl(undefined)).toBe(false);
    expect(isRealPostgresUrl('sqlite://local.db')).toBe(false);
    expect(isRealPostgresUrl('postgresql://user:pass@localhost:5432/mydb')).toBe(true);
  });

  it('operates database in mock mode without errors', async () => {
    await dbAdapter.init();

    await dbAdapter.insertLog({
      id: 'test-log-1',
      promptHash: 'hash-1',
      promptPreview: 'Hello world',
      complexityTier: 'tier1',
      routedModel: 'gpt-4o-mini',
      provider: 'openai',
      inputTokens: 10,
      outputTokens: 20,
      cost: 0.0001,
      latencyMs: 15,
      qualityScore: 4.5,
      wasEscalated: false,
      escalatedToModel: null,
      timestamp: new Date().toISOString(),
    });

    const recent = await dbAdapter.getRecentLogs(5);
    expect(recent.length).toBeGreaterThanOrEqual(1);
    expect(recent[0].id).toBe('test-log-1');

    const stats = await dbAdapter.getStats();
    expect(stats.totalRequests).toBeGreaterThanOrEqual(1);
  });

  it('generates deterministic mock completions when keys are absent', async () => {
    const res = await sendRequest(
      { messages: [{ role: 'user', content: 'Explain quantum computing' }] },
      'gpt-4o-mini',
      'tier1'
    );

    expect(res.content).toContain('[Mock Response]');
    expect(res.usage.promptTokens).toBe(10);
    expect(res.usage.completionTokens).toBe(20);
  });
});
