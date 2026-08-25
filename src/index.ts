import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { loadRoutingConfig } from './router';
import { getDb } from './database';
import apiRouter from './routes/api';
import logger from './logger';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '4mb' }));

// Request logging
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// Health check — does not require auth
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/v1', apiRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

async function main() {
  // Initialize dependencies
  try {
    loadRoutingConfig();
    getDb(); // Initialize SQLite schema
    logger.info('LLM Cost Autopilot initialized', {
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      qualityVerification: process.env.QUALITY_VERIFICATION_ENABLED === 'true',
    });
  } catch (err) {
    logger.error('Initialization failed', { error: err });
    process.exit(1);
  }

  app.listen(PORT, () => {
    logger.info(`Server running`, { port: PORT, env: process.env.NODE_ENV });
    logger.info(`Endpoints:
      POST /v1/completions  - Route a completion request
      POST /v1/classify     - Classify prompt complexity without executing
      GET  /v1/models       - List models and pricing
      GET  /v1/stats        - Cost savings summary
      GET  /v1/logs         - Recent request logs
      PUT  /v1/routing-config - Update routing configuration
    `);
  });
}

main();
