import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import { repoRoot } from '../scripts/flow-capture/config';

async function source(relativePath: string): Promise<string> {
  return Bun.file(path.join(repoRoot, relativePath)).text();
}

function occurrences(value: string, fragment: string): number {
  return value.split(fragment).length - 1;
}

describe('question-aware option chips', () => {
  test('the shared press primitive and option chip preserve a separate accessibility hint', async () => {
    const pressableScale = await source('apps/mobile/src/components/motion/pressable-scale.tsx');
    const optionChip = await source('apps/mobile/src/components/onboarding/option-chip.tsx');

    expect(pressableScale).toContain('readonly accessibilityHint?: string;');
    expect(pressableScale).toMatch(
      /accessibilityLabel,\s+accessibilityHint,[\s\S]*?accessibilityLabel=\{accessibilityLabel\}\s+accessibilityHint=\{accessibilityHint\}/,
    );
    expect(optionChip).toContain('readonly accessibilityHint?: string;');
    expect(optionChip).toMatch(
      /accessibilityLabel=\{label\}\s+accessibilityHint=\{accessibilityHint\}/,
    );
  });

  test('every logistics chip carries its localized visible question as context', async () => {
    const logistics = await source('apps/mobile/src/app/(app)/onboarding/logistics.tsx');

    expect(occurrences(logistics, "accessibilityHint={t('referenceEntityLabel')}")).toBe(1);
    expect(occurrences(logistics, "accessibilityHint={t('hasDependentsLabel')}")).toBe(2);
    expect(occurrences(logistics, "accessibilityHint={t('clothingSizeLabel')}")).toBe(1);
    expect(occurrences(logistics, "accessibilityHint={t('shoeSizeLabel')}")).toBe(1);
  });

  test('every profile-edit chip carries its localized visible question as context', async () => {
    const profileEdit = await source('apps/mobile/src/app/(app)/profile-edit.tsx');

    expect(occurrences(profileEdit, "accessibilityHint={t('onboarding:documentTypeLabel')}")).toBe(
      1,
    );
    expect(occurrences(profileEdit, "accessibilityHint={t('onboarding:hasDependentsLabel')}")).toBe(
      2,
    );
    expect(occurrences(profileEdit, "accessibilityHint={t('onboarding:clothingSizeLabel')}")).toBe(
      1,
    );
    expect(occurrences(profileEdit, "accessibilityHint={t('onboarding:shoeSizeLabel')}")).toBe(1);
    expect(occurrences(profileEdit, "accessibilityHint={t('onboarding:mediaConsentLabel')}")).toBe(
      2,
    );
  });
});
