import { ComplexityTier } from './types';

/**
 * ComplexityClassifier - Feature-based heuristic classifier
 * 
 * Analyzes prompt features to determine routing tier:
 * - Tier 1 (simple): extraction, reformatting, basic Q&A from context
 * - Tier 2 (moderate): summarization, classification, structured analysis  
 * - Tier 3 (complex): multi-step reasoning, creative generation, nuanced judgment
 * 
 * Designed as a fast, deterministic, zero-API-call classifier.
 * In production, this can be replaced with a small fine-tuned model.
 */

interface ComplexityFeatures {
  tokenCount: number;
  hasAnalyzeInstruction: boolean;
  hasCompareInstruction: boolean;
  hasMultiStepInstruction: boolean;
  hasCreativeInstruction: boolean;
  hasContextProvided: boolean;
  constraintCount: number;
  outputFormatComplexity: number;   // 0=none, 1=simple, 2=structured, 3=complex
  questionCount: number;
  hasCodeInstruction: boolean;
  hasJudgmentInstruction: boolean;
}

// Weight configuration for feature scoring
const FEATURE_WEIGHTS: Record<keyof ComplexityFeatures, number> = {
  tokenCount: 0,         // handled separately
  hasAnalyzeInstruction: 2,
  hasCompareInstruction: 2,
  hasMultiStepInstruction: 3,
  hasCreativeInstruction: 3,
  hasContextProvided: -1,  // context provided = simpler (less reasoning needed)
  constraintCount: 1,
  outputFormatComplexity: 1,
  questionCount: 1,
  hasCodeInstruction: 2,
  hasJudgmentInstruction: 3,
};

// Regex patterns for feature extraction
const PATTERNS = {
  analyze: /\b(analyz|analys|evaluat|assess|examin|investigat|breakdown)/i,
  compare: /\b(compar|contrast|differ|similarit|versus|vs\.?)\b/i,
  multiStep: /\b(step[\s-]by[\s-]step|first.+then|multiple|chain|sequential|workflow|pipeline)\b/i,
  creative: /\b(creat|generat|writ|draft|compose|design|invent|imagin)\b/i,
  judgment: /\b(best|worst|recommend|advise|should|would you|what do you think|opinion|judgment)\b/i,
  code: /\b(code|implement|function|class|script|program|debug|refactor)\b/i,
  constraints: /\b(must|should|only|exactly|ensure|require|follow|adhere|constraint|rule|limit)\b/ig,
  questions: /\?/g,
  contextMarkers: /\b(given|provided|following|below|context|above|here is|here are)\b/i,
  structuredOutput: /\b(json|yaml|xml|table|list|bullet|format|schema|structure)\b/i,
  complexStructure: /\b(nested|hierarchical|recursive|tree|graph|dependency)\b/i,
};

export function extractFeatures(prompt: string): ComplexityFeatures {
  const words = prompt.split(/\s+/);
  const constraints = (prompt.match(PATTERNS.constraints) || []).length;
  const questions = (prompt.match(PATTERNS.questions) || []).length;

  let outputFormatComplexity = 0;
  if (PATTERNS.structuredOutput.test(prompt)) outputFormatComplexity = 2;
  if (PATTERNS.complexStructure.test(prompt)) outputFormatComplexity = 3;

  return {
    tokenCount: words.length,
    hasAnalyzeInstruction: PATTERNS.analyze.test(prompt),
    hasCompareInstruction: PATTERNS.compare.test(prompt),
    hasMultiStepInstruction: PATTERNS.multiStep.test(prompt),
    hasCreativeInstruction: PATTERNS.creative.test(prompt),
    hasContextProvided: PATTERNS.contextMarkers.test(prompt),
    constraintCount: Math.min(constraints, 5),  // cap at 5
    outputFormatComplexity,
    questionCount: Math.min(questions, 3),
    hasCodeInstruction: PATTERNS.code.test(prompt),
    hasJudgmentInstruction: PATTERNS.judgment.test(prompt),
  };
}

export function scoreComplexity(features: ComplexityFeatures): number {
  let score = 0;

  // Token count contribution
  if (features.tokenCount < 50) score += 0;
  else if (features.tokenCount < 200) score += 1;
  else if (features.tokenCount < 500) score += 2;
  else score += 4;

  // Feature-based scoring
  for (const [key, weight] of Object.entries(FEATURE_WEIGHTS)) {
    if (key === 'tokenCount') continue;
    const featureKey = key as keyof ComplexityFeatures;
    const value = features[featureKey];

    if (typeof value === 'boolean') {
      if (value) score += weight;
    } else if (typeof value === 'number') {
      score += value * weight;
    }
  }

  return score;
}

export function classifyComplexity(prompt: string): {
  tier: ComplexityTier;
  score: number;
  features: ComplexityFeatures;
  reasoning: string;
} {
  const features = extractFeatures(prompt);
  const score = scoreComplexity(features);

  let tier: ComplexityTier;
  let reasoning: string;

  if (score <= 2) {
    tier = 'tier1';
    reasoning = 'Simple extraction, reformatting, or basic Q&A — routed to cheapest model';
  } else if (score <= 7) {
    tier = 'tier2';
    reasoning = 'Moderate complexity (summarization, classification, analysis) — routed to mid-tier model';
  } else {
    tier = 'tier3';
    reasoning = 'High complexity (multi-step reasoning, creative generation, judgment) — routed to highest-quality model';
  }

  return { tier, score, features, reasoning };
}
