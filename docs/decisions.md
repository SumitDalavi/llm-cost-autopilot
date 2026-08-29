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
