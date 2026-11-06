/**
 * Her needs details screen names the needs she ticked (RAPP-782), on her
 * needs screen's own follow-up and wherever staff moved Necessitats
 * específiques.
 */
import { describe, expect, test } from 'bun:test';
import type { IntakeCatalog } from '@ramassa/shared/intake-builder';
import { supportNeedsTitle, tickedSupportNeeds } from './support-needs-title';

const t = (key: string, options?: Record<string, unknown>) =>
  options === undefined ? key : `${key}(${JSON.stringify(options)})`;

const NEEDS = '5eed0000-0000-4000-8099-0000000000c1';
const catalog = {
  screens: [],
  overrides: [],
  presets: [],
  systemFields: new Map([
    [
      'specific_needs',
      {
        id: NEEDS,
        type: 'multiple_choice',
        privacy: 'sensitive',
        options: [
          { id: 'o-health', key: 'health', label: { ca: 'Salut' }, isArchived: false },
          {
            id: 'o-access',
            key: 'accessibility',
            label: { ca: 'Accessibilitat' },
            isArchived: false,
          },
          { id: 'o-none', key: 'none', label: { ca: 'Cap' }, isArchived: false },
        ],
      },
    ],
  ]),
} as unknown as IntakeCatalog;

describe('her needs details title', () => {
  test('her ticks by field are read as the app’s needs, in the app’s order', () => {
    expect(tickedSupportNeeds(catalog, { [NEEDS]: ['o-health', 'o-access'] })).toEqual([
      'accessibility',
      'health',
    ]);
    expect(tickedSupportNeeds(catalog, { [NEEDS]: ['o-none'] })).toEqual([]);
  });

  test('one need asks its own question; several, one question naming them', () => {
    expect(supportNeedsTitle(['health'], t)).toBe('supportNeedHealthQuestion');
    expect(supportNeedsTitle(['accessibility', 'health'], t)).toBe(
      'supportNeedsCombinedQuestion({"needs":"supportNeedsListAnd({\\"first\\":\\"onboarding:supportNeedAccessibility\\",\\"last\\":\\"onboarding:supportNeedHealth\\"})"})',
    );
    expect(supportNeedsTitle([], t)).toBeNull();
  });
});
