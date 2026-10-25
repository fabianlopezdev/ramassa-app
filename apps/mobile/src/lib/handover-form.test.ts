import { describe, expect, test } from 'bun:test';
import { systemFieldIndexFromCatalog } from '@ramassa/shared/intake-builder';
import {
  systemFieldFixtureId as fieldId,
  systemOptionFixtureId as optionId,
  systemFieldsCatalogFixture,
} from '@ramassa/shared/testing';
import { handoverSignature, herSizes, statementLanguageFor, suggestedSize } from './handover-form';

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

describe('herSizes', () => {
  const fields = systemFieldIndexFromCatalog(systemFieldsCatalogFixture());

  test('her sizes are the keys of the options she chose, read through the features', () => {
    expect(
      herSizes(fields, {
        [fieldId('clothing_size')]: optionId('clothing_size', 'M'),
        [fieldId('shoe_size')]: optionId('shoe_size', '39'),
      }),
    ).toEqual({ clothingSize: 'M', shoeSize: '39' });
    expect(herSizes(fields, {})).toEqual({ clothingSize: null, shoeSize: null });
  });

  test('a size field changed to a type the handover cannot read suggests nothing', () => {
    const changed = systemFieldIndexFromCatalog({
      fields: systemFieldsCatalogFixture().fields.map((field) =>
        (field as { system_key: string }).system_key === 'shoe_size'
          ? { ...(field as object), question_type: 'short_text' }
          : field,
      ),
    });
    expect(herSizes(changed, { [fieldId('shoe_size')]: '39' }).shoeSize).toBeNull();
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
