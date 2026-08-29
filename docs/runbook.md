# Runbook — llm-cost-autopilot
> Last updated: 2026-08-29

## Prerequisites
| Tool | Required Version | How to check |
|---|---|---|
| Node.js | >= 20 | `node -v` |

## Quick Start
```bash
# Install dependencies
npm install

# Start server
npm run dev

# Verify
curl http://localhost:3000/health
```

## Run Tests
```bash
# Unit tests
npm test
```

Expected output:
```
PASS  __tests__/classifier.test.ts
PASS  __tests__/router.test.ts
```

## Environment Variables
| Variable | Default | Purpose |
|---|---|---|
| PORT | `3000` | HTTP port for the proxy |
| OPENAI_API_KEY | - | Key for OpenAI |
| ANTHROPIC_API_KEY | - | Key for Anthropic |

## Common Failure Modes
| Symptom | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | Invalid upstream API key | Check `.env` configuration |
| `Model not configured for tier` | `config/routing.yaml` is invalid | Ensure all tiers have a configured primary model |
