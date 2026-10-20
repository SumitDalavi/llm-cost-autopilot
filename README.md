# LLM Cost Autopilot

[![Release](https://img.shields.io/github/v/release/SumitDalavi/llm-cost-autopilot?color=blue&logo=github)](https://github.com/SumitDalavi/llm-cost-autopilot/releases)
[![Release Workflow](https://github.com/SumitDalavi/llm-cost-autopilot/actions/workflows/release.yml/badge.svg)](https://github.com/SumitDalavi/llm-cost-autopilot/actions/workflows/release.yml)
[![SBOM](https://img.shields.io/badge/SBOM-SPDX%20JSON-blueviolet?logo=spdx)](https://github.com/SumitDalavi/llm-cost-autopilot/releases)

[![Release](https://img.shields.io/github/v/release/SumitDalavi/llm-cost-autopilot?color=blue&logo=github)](https://github.com/SumitDalavi/llm-cost-autopilot/releases)
[![SBOM](https://img.shields.io/badge/SBOM-SPDX%20JSON-blueviolet?logo=spdx)](https://github.com/SumitDalavi/llm-cost-autopilot/releases)

> **Maturity:** Full Prototype
> _An intelligent routing proxy that reduces LLM API costs by dynamically routing requests based on complexity._

> An intelligent routing proxy that sits in front of OpenAI, Anthropic, and Ollama. Every incoming request is classified by complexity and routed to the cheapest model capable of handling it — with async quality verification to catch any regressions.

[![CI Pipeline](https://github.com/SumitDalavi/llm-cost-autopilot/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/SumitDalavi/llm-cost-autopilot/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green?logo=nodedotjs)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## 🎯 The Problem This Solves

Every company running LLMs at scale is bleeding money on over-provisioned model calls. A request to check if an email address is valid does **not** need GPT-4o ($10/M output tokens). It needs Haiku ($1.25/M output tokens) — 8× cheaper, nearly identical quality.

This system automates that decision for every single request.

## 🏗️ Architecture

```
Client Request
      │
      ▼
 ┌─────────────┐
 │  POST /v1/  │     ┌─────────────────────────┐
 │ completions │────▶│  Complexity Classifier   │
 └─────────────┘     │  (feature-based heuristic│
                     │  token count, patterns)  │
                     └───────────┬─────────────┘
                                 │ tier1/tier2/tier3
                     ┌───────────▼─────────────┐
                     │     Router               │
                     │  (reads routing.yaml)    │
                     └───────┬────────┬─────────┘
                             │        │
                    ┌────────▼─┐  ┌───▼──────────┐
                    │ Anthropic│  │   OpenAI     │
                    │  Haiku   │  │ gpt-4o-mini  │
                    │  Sonnet  │  │   gpt-4o     │
                    └──────────┘  └──────────────┘
                             │
                     ┌───────▼─────────┐
                     │ Async Quality   │  ← Non-blocking, runs after
                     │ Verifier        │    response is returned
                     │ (LLM-as-judge)  │
                     └───────┬─────────┘
                             │ if score < threshold
                     ┌───────▼─────────┐
                     │  Auto-Escalate  │
                     │  to higher tier │
                     └─────────────────┘
```

## 🛠️ Tech Stack

| Component | Technology |
|---|---|
| Language | TypeScript 5.3 + Node.js 20 |
| API Framework | Express 4 |
| LLM Providers | OpenAI SDK, Anthropic SDK, Ollama (local) |
| Complexity Classifier | Feature-based heuristic (deterministic, zero API cost) |
| Quality Verification | LLM-as-judge via gpt-4o-mini |
| Database | better-sqlite3 (WAL mode, zero infra) |
| Logging | Winston (structured JSON) |
| Config | YAML hot-reload |
| Containerization | Docker + docker-compose |

## 🚀 Quick Start

### 1. Clone and install
```bash
git clone https://github.com/SumitDalavi/llm-cost-autopilot.git
cd llm-cost-autopilot
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Add your API keys to .env
```

### 3. Start the server
```bash
npm run dev      # Development with hot reload
# or
docker-compose up -d   # Production with Ollama
```

### 4. Make a request
```bash
curl -X POST http://localhost:3000/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What is the capital of France?"}
    ]
  }'
```

Response includes routing metadata:
```json
{
  "id": "uuid",
  "content": "The capital of France is Paris.",
  "model": "claude-haiku-20240307",
  "complexityTier": "tier1",
  "cost": {
    "totalCost": 0.0000021,
    "savedVsGpt4o": 0.0000279
  },
  "latencyMs": 712,
  "wasEscalated": false
}
```

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/completions` | Route a completion request (model auto-selected) |
| `POST` | `/v1/classify` | Preview routing decision without executing |
| `GET` | `/v1/models` | List all models and their pricing |
| `GET` | `/v1/stats` | Cost savings summary and routing distribution |
| `GET` | `/v1/logs` | Recent request logs |
| `PUT` | `/v1/routing-config` | Update routing config (hot-reload) |
| `GET` | `/health` | Health check |

## 💰 Cost Telemetry

The `GET /v1/stats` endpoint returns cost telemetry and routing distribution metrics.

## ⚙️ Routing Configuration

Edit `config/routing.yaml` to change model assignments:

```yaml
tiers:
  tier1:
    primary: { provider: anthropic, modelId: claude-haiku-20240307 }
    fallback: { provider: openai, modelId: gpt-4o-mini }
  tier2:
    primary: { provider: openai, modelId: gpt-4o-mini }
  tier3:
    primary: { provider: openai, modelId: gpt-4o }
qualityThreshold: 0.75
autoEscalation: true
```

Call `POST /v1/routing-config/reload` to apply without restarting.

## 🧪 Tests

```bash
npm test                    # Run all tests
npm test -- --watch        # Watch mode
```

The classifier test suite covers all three complexity tiers and all feature extraction patterns.

## Mock Boundaries (Honest Scope)

| What | Status | Details |
|---|---|---|
| OpenAI / Anthropic APIs | **Optional** | Uses real APIs when keys are provided, otherwise falls back to a mocked LLM interface for testing. |
| Ollama | **Optional** | Can connect to a local Ollama instance for local routing. |
| SQLite Database | **Real** | Uses `better-sqlite3` for high-throughput, zero-infra local logging. |

## 🚀 Progressive Credential Loading & Execution Tiers

This project implements **Progressive Credential Loading (PCL)**, allowing it to run immediately out-of-the-box without external dependencies while seamlessly upgrading as credentials are provided.

### Tier 1: Zero-Config Mock Mode (Default)
Ideal for CI, testing, and rapid local evaluation.
- **Execution:** Run with default configuration (`cp .env.example .env`). Zero API keys, databases, or cloud credentials required.
- **Fallback Behavior:** In-memory caches, deterministic offline heuristics, mock vector embeddings, and local mock storage are automatically used.
- **Health Verification:** Endpoints report `{"mode": "mock"}` for unconfigured dependencies.

### Tier 2: Local Development with Live Services
Connect specific external services while keeping others mocked.
- **Execution:** Provide credentials in `.env` for the services you want active (e.g., `DATABASE_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY`).
- **Progressive Upgrade:** The runtime inspects environment variables on boot and dynamically promotes only configured modules to live mode.
- **Safe Fallback:** Any missing credentials automatically remain on mock fallbacks with no crashes or missing service errors.

### Tier 3: Production Hardened
Enterprise deployment with production-grade backends, security scans, and container distributions.
- **OCI Container Image:** Pre-built, multi-arch image on GitHub Container Registry:
  ```bash
  docker pull ghcr.io/sumitdalavi/llm-cost-autopilot:v0.2.0
  ```
- **Production Orchestration:** Mount secrets via Kubernetes Secrets or cloud secret managers with atomic config reload support.
- **Release Verification:** Checksums and SPDX SBOM available on [GitHub Releases](https://github.com/SumitDalavi/llm-cost-autopilot/releases).

## 📚 Documentation

- [Architecture](docs/ARCHITECTURE.md) — System diagram and component details
- [Runbook](docs/runbook.md) — Setup, commands, and expected outputs
- [Decisions](docs/decisions.md) — ADRs for router pattern choices
- [Changelog](docs/changelog.md) — Change history

## 👨‍💻 Author

**Sumit Dalavi** — Senior DevSecOps / Platform Engineer  
[GitHub](https://github.com/SumitDalavi) · [LinkedIn](https://in.linkedin.com/in/sumit-dalavi-762838129)


## CI & Reliability Updates (August 2026)

- **CI Pipeline Remediation:** Successfully resolved all CI/CD pipeline failures and established baseline CI workflows.
- **Specific Fix:** Added and configured robust GitHub Actions workflows for automated testing, linting, and formatting.
- **Status:** 🟩 Passing


## 📄 Architecture Decisions

See [`docs/architecture.md`](docs/architecture.md) for:
- Why a heuristic classifier over an LLM-based one
- Trade-offs of synchronous routing vs. async quality verification
- The feedback loop design for continuous improvement

## Release & Security Verification

The project includes an automated DevSecOps release pipeline (`.github/workflows/release.yml`) triggered on semantic version tags (`v*.*.*`).

Each release automatically:
1. Executes test suite gates.
2. Builds the container image.
3. Performs vulnerability scanning via Trivy.
4. Generates an SPDX SBOM (`sbom.spdx.json`) using Anchore Syft.
5. Publishes a GitHub Release with attached SBOM.

### Verifying the Release
```bash
# Verify release via GitHub CLI
gh release view v0.1.0 --repo SumitDalavi/llm-cost-autopilot

# Download and inspect SBOM
gh release download v0.1.0 --repo SumitDalavi/llm-cost-autopilot --pattern "sbom.spdx.json"
cat sbom.spdx.json | jq .
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Runbook](docs/runbook.md)
- [Decisions](docs/decisions.md)
- [Changelog](docs/changelog.md)