import { classifyComplexity, extractFeatures, scoreComplexity } from '../src/classifier';

describe('ComplexityClassifier', () => {
  describe('Tier 1: Simple prompts', () => {
    test('should classify extraction as tier1', () => {
      const result = classifyComplexity('Extract the email address from this text: "Contact us at hello@example.com"');
      expect(result.tier).toBe('tier1');
    });

    test('should classify short reformatting as tier1', () => {
      const result = classifyComplexity('Convert this JSON to YAML: { "name": "Alice" }');
      expect(result.tier).toBe('tier1');
    });

    test('should classify basic Q&A as tier1', () => {
      const result = classifyComplexity('Given the context above, what is the capital of France?');
      expect(result.tier).toBe('tier1');
    });
  });

  describe('Tier 2: Moderate prompts', () => {
    test('should classify summarization as tier2', () => {
      const result = classifyComplexity('Summarize this 500-word article into 3 key bullet points, highlighting the main argument and supporting evidence.');
      expect(result.tier).toBe('tier2');
    });

    test('should classify classification task as tier2', () => {
      const result = classifyComplexity('Classify this customer support email into one of these categories: billing, technical, account, general. Return a JSON object with category and confidence.');
      expect(result.tier).toBe('tier2');
    });
  });

  describe('Tier 3: Complex prompts', () => {
    test('should classify multi-step reasoning as tier3', () => {
      const result = classifyComplexity('Analyze the strategic implications of this acquisition. Compare the long-term growth trajectory against alternatives, evaluate synergies step by step, and provide a recommendation with your judgment on whether this creates shareholder value.');
      expect(result.tier).toBe('tier3');
    });

    test('should classify creative generation as tier3', () => {
      const result = classifyComplexity('Write a detailed technical blog post about distributed systems, comparing eventual consistency with strong consistency, with code examples and analysis of real-world trade-offs.');
      expect(result.tier).toBe('tier3');
    });

    test('should classify judgment/opinion requests as tier3', () => {
      const result = classifyComplexity('What do you think would be the best architecture for a high-traffic microservices system? Analyze the trade-offs and give me your recommendation.');
      expect(result.tier).toBe('tier3');
    });
  });

  describe('Feature extraction', () => {
    test('should detect analyze instruction', () => {
      const features = extractFeatures('Analyze this dataset carefully');
      expect(features.hasAnalyzeInstruction).toBe(true);
    });

    test('should detect context markers', () => {
      const features = extractFeatures('Given the following context: ...');
      expect(features.hasContextProvided).toBe(true);
    });

    test('should count questions correctly', () => {
      const features = extractFeatures('What is this? How does it work? Why?');
      expect(features.questionCount).toBe(3);
    });

    test('should cap question count at 3', () => {
      const features = extractFeatures('What? Why? How? When? Where? Who?');
      expect(features.questionCount).toBe(3);
    });
  });
});
