# Decisions

## ADR-001: Heuristic Classifier vs LLM Classifier
**Date:** 2026-08-29  
**Status:** Accepted

**Context:**  
To route requests effectively, we must determine their complexity. We could use a fast, cheap LLM to classify the prompt, or use a heuristic (rules-based) approach.

**Decision:**  
We chose a heuristic classifier that analyzes token length, prompt structure (e.g., presence of "code", "explain", "summarize"), and specific keyword patterns.

**Consequences:**  
- ✅ Zero latency added for classification.
- ✅ Zero API cost added.
- ⚠️ Less accurate than an LLM judge, which is why we pair it with an asynchronous quality verification step.

## ADR-002: Progressive Credential Loading (PCL) Architecture
- **Context:** Production hardening required live backends (PostgreSQL, Redis, OpenAI, Anthropic), but removing mocks would break CI pipelines and create high developer onboarding friction.
- **Decision:** Implement Progressive Credential Loading. Keep in-memory and local mock heuristics as the default safe baseline, while wrapping external integrations in auto-promoting factory adapters triggered by environment variables.
- **Consequences:** 
  - *Pros:* 100% CI pass rate without requiring external secrets; zero setup friction for new contributors; progressive upgrade to production clusters.
  - *Cons:* Adds lightweight factory abstraction layers and runtime credential detection logic.
