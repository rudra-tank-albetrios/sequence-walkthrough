import { parseFlow } from '@swv/core';
import { describe, expect, it } from 'vitest';

import { DEFAULT_DIAGRAM } from '../../shared/lib/defaultDiagram.ts';
import { factsIn, isSupported, sameWording, stepEvidence, unsupportedFacts } from './support.ts';

const { flow } = parseFlow(DEFAULT_DIAGRAM);

function evidenceOf(key: string) {
  const step = flow.steps.find((candidate) => candidate.key === key);
  if (!step) throw new Error(`no step ${key}`);
  return stepEvidence(flow, step);
}

const unauthorized = evidenceOf('APP→API|401 Unauthorized');
const placeOrder = evidenceOf('API→APP|POST /api/orders');

describe('whether a step backs up an answer', () => {
  it('accepts the words and facts of the step', () => {
    expect(isSupported('401 Unauthorized', unauthorized)).toBe(true);
    expect(isSupported('POST /api/orders', placeOrder)).toBe(true);
  });

  it('refuses a fact the step does not show, however well the other words match', () => {
    expect(isSupported('403 Unauthorized', unauthorized)).toBe(false);
    expect(isSupported('DELETE /api/orders', placeOrder)).toBe(false);
    expect(isSupported('POST /api/orders/1234', placeOrder)).toBe(false);
  });

  it('refuses an answer about something else', () => {
    expect(isSupported('The moon landing happened in black and white', unauthorized)).toBe(false);
    expect(isSupported('A flying saucer delivers parcels overnight', placeOrder)).toBe(false);
  });

  it('refuses an empty answer and one of only filler words', () => {
    expect(isSupported('', unauthorized)).toBe(false);
    expect(isSupported('the of and', unauthorized)).toBe(false);
  });

  it('counts the step number, the chapter and every layer name as facts of the flow', () => {
    const step = flow.steps.find((candidate) => candidate.key === 'APP→API|401 Unauthorized');
    if (!step) throw new Error('no step');
    expect(unsupportedFacts(`Step ${step.n} in chapter ${step.section + 1} answers 401.`, unauthorized)).toEqual([]);
    expect(isSupported('Mail Worker', unauthorized)).toBe(true);
    expect(unsupportedFacts('Step 999 answers.', unauthorized)).toEqual(['999']);
  });

  it('lists the facts a reason invents', () => {
    expect(factsIn('It returns 503 from getOrder via PUT and order_items')).toEqual(
      expect.arrayContaining(['503', 'getorder', 'put', 'order_items']),
    );
    expect(unsupportedFacts('It answers 401 Unauthorized.', unauthorized)).toEqual([]);
    expect(unsupportedFacts('It answers 503 from fakeService.', unauthorized)).toEqual(
      expect.arrayContaining(['503', 'fakeservice']),
    );
  });
});

describe('sameWording', () => {
  it('finds the same question in slightly different words', () => {
    expect(sameWording('Which status does the reply carry?', 'So which status does this reply carry?')).toBe(true);
  });

  it('keeps questions apart that name another fact or ask another thing', () => {
    expect(sameWording('Which status does step 7 return?', 'Which status does step 9 return?')).toBe(false);
    expect(sameWording('Which status does the reply carry?', 'Which layer sends the reply?')).toBe(false);
  });
});
