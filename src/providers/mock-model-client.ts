import type { ModelClient, StructuredDecode } from './model-client.js';

/**
 * Deterministic mock model client for tests and offline wiring. It returns a
 * realistic-shaped structured decode without any inference, so the mapping and
 * validation layers can be exercised before a real model is connected.
 */
export const mockModelClient: ModelClient = {
  async analyzeImage(): Promise<StructuredDecode> {
    return {
      summary: 'A mock semiotic reading produced without model inference.',
      observations: [
        {
          description: 'A large product image dominates the frame.',
          evidence_type: 'visual',
          location: 'center',
          confidence: 'high',
        },
        {
          description: 'Headline copy makes a benefit claim.',
          evidence_type: 'copy',
          location: 'top',
          confidence: 'medium',
        },
        {
          description: 'Unknown future evidence type is normalized by the mapper.',
          evidence_type: 'some_future_type',
          location: null,
          confidence: 'unknown_confidence',
        },
      ],
      claims: [
        {
          kind: 'core_message',
          text: 'The product promises a desirable outcome.',
          evidence_indices: [0, 1],
          references: [
            {
              reference_type: 'glossary_concept',
              reference_value: 'signifier',
              required_for_claim: true,
            },
            {
              reference_type: 'persuasion_technique',
              reference_value: 'aspiration',
              required_for_claim: false,
            },
          ],
        },
        {
          kind: 'not_a_real_kind',
          text: 'This claim exercises kind normalization.',
          evidence_indices: [99],
          references: [
            {
              reference_type: 'evidence_record',
              reference_value: 'evidence_001',
              required_for_claim: true,
            },
          ],
        },
      ],
    };
  },
};
