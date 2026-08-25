import { Router, Request, Response } from 'express';
import { routeRequest, getRoutingConfig, updateRoutingConfig, loadRoutingConfig } from '../router';
import { getStats, getRecentLogs } from '../database';
import { MODEL_REGISTRY } from '../modelRegistry';
import { classifyComplexity } from '../classifier';
import { CompletionRequest } from '../types';
import logger from '../logger';

const router = Router();

/**
 * POST /v1/completions
 * Main endpoint — accepts a chat completion request and returns the routed response.
 * The router selects the model; the caller doesn't choose.
 */
router.post('/completions', async (req: Request, res: Response): Promise<void> => {
  try {
    const body: CompletionRequest = req.body;

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({ error: 'messages array is required and must not be empty' });
      return;
    }

    const response = await routeRequest(body);
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Completion request failed', { error: message });
    res.status(500).json({ error: message });
  }
});

/**
 * POST /v1/classify
 * Debug endpoint — shows what tier and model a prompt would be routed to without executing it.
 */
router.post('/classify', (req: Request, res: Response): void => {
  const { prompt } = req.body as { prompt: string };
  if (!prompt) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  const { tier, score, features, reasoning } = classifyComplexity(prompt);
  const config = getRoutingConfig();
  const tierConfig = config.tiers[tier];

  res.json({
    tier,
    score,
    reasoning,
    routedTo: tierConfig.primary.modelId,
    features,
  });
});

/**
 * GET /v1/models
 * Returns all available models with their pricing information.
 */
router.get('/models', (_req: Request, res: Response): void => {
  res.json({
    models: Object.entries(MODEL_REGISTRY).map(([id, config]) => ({
      id,
      provider: config.provider,
      qualityTier: config.qualityTier,
      costPerInputToken: config.costPerInputToken,
      costPerOutputToken: config.costPerOutputToken,
      avgLatencyMs: config.avgLatencyMs,
      maxContextTokens: config.maxContextTokens,
    })),
  });
});

/**
 * GET /v1/stats
 * Returns cost savings summary, routing distribution, and quality metrics.
 */
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve stats' });
  }
});

/**
 * GET /v1/logs
 * Returns the most recent request logs.
 */
router.get('/logs', async (req: Request, res: Response): Promise<void> => {
  const limit = parseInt(req.query.limit as string) || 50;
  const logs = await getRecentLogs(limit);
  res.json({ logs, count: logs.length });
});

/**
 * PUT /v1/routing-config
 * Hot-reload the routing configuration without restarting the server.
 */
router.put('/routing-config', (req: Request, res: Response): void => {
  try {
    updateRoutingConfig(req.body);
    res.json({ message: 'Routing config updated successfully', config: getRoutingConfig() });
  } catch (err) {
    res.status(400).json({ error: 'Invalid routing config' });
  }
});

/**
 * POST /v1/routing-config/reload
 * Re-reads the routing.yaml file from disk.
 */
router.post('/routing-config/reload', (_req: Request, res: Response): void => {
  try {
    const config = loadRoutingConfig();
    res.json({ message: 'Routing config reloaded from disk', config });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reload routing config' });
  }
});

export default router;
