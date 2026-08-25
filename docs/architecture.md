# Architecture: LLM Cost Autopilot

## System Diagram
The following Mermaid.js sequence diagram maps the core workflow and interactions:

```mermaid
sequenceDiagram
Client->>Router: Request
Router->>Classifier: Determine complexity
Classifier-->>Router: Tier 1 (Simple)
Router->>CheapModel: Send request
CheapModel-->>Client: Response
Router-)Verifier: Async quality check
```

## Component Breakdown
- **Core Technology**: TypeScript, Express, OpenAI, Anthropic, Ollama
- **Design Paradigm**: Emphasizes high availability, fault tolerance, and security.
