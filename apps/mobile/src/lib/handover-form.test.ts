import { describe, expect, test } from 'bun:test';
import { handoverSignature, statementLanguageFor, suggestedSize } from './handover-form';

describe('suggestedSize', () => {
  const her = { clothingSize: 'M', shoeSize: '39' };

  test('boots take her shoe size, clothes her clothing size', () => {
    expect(suggestedSize('boots', ['38', '39', '40'], her)).toBe('39');
    expect(suggestedSize('jersey', ['S', 'M', 'L'], her)).toBe('M');
  });

  test('no suggestion when the item does not come in her size', () => {
    expect(suggestedSize('boots', ['40', '41'], her)).toBeNull();
    expect(suggestedSize('water_bottle', [], her)).toBeNull();
    expect(suggestedSize('jersey', ['S', 'M'], { clothingSize: null, shoeSize: null })).toBeNull();
  });
});

describe('statementLanguageFor', () => {
  test('her language when the statement exists in it, else Catalan', () => {
    expect(statementLanguageFor('fa')).toBe('fa');
    expect(statementLanguageFor(null)).toBe('ca');
    expect(statementLanguageFor('fr')).toBe('ca');
  });
});

describe('handoverSignature', () => {
  test('her strokes make a signed record', () => {
    expect(handoverSignature({ strokes: [[[1, 2]]], unsigned: null, reason: '' })).toEqual({
      state: 'signed',
      strokes: [[[1, 2]]],
    });
  });

  test('not signing needs a reason', () => {
    expect(handoverSignature({ strokes: null, unsigned: 'unable', reason: '  ' })).toBeNull();
    expect(
      handoverSignature({ strokes: null, unsigned: 'unable', reason: ' Hand injury ' }),
    ).toEqual({ state: 'unable', reason: 'Hand injury' });
  });

  test('nothing yet saves nothing', () => {
    expect(handoverSignature({ strokes: null, unsigned: null, reason: '' })).toBeNull();
  });
});
