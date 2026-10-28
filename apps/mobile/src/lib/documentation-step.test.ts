import { expect, test } from 'bun:test';
import {
  documentationForChoice,
  documentDetailsSchemaFor,
  hasDocumentDetails,
} from './documentation-step';
import { wizardStepRoute } from './onboarding-intake';

test('only NIE, passport and Other open document details', () => {
  for (const type of ['nie', 'passport', 'other']) expect(hasDocumentDetails(type)).toBe(true);
  for (const type of ['none', 'skip', undefined]) expect(hasDocumentDetails(type)).toBe(false);
});
test('skip, no document and a different type discard previous document data', () => {
  const saved = { documentType: 'other' as const, documentName: 'Permit', documentNumber: 'P123' };
  expect(documentationForChoice('skip', saved)).toEqual({});
  expect(documentationForChoice('none', saved)).toEqual({ documentType: 'none' });
  expect(documentationForChoice('passport', saved)).toEqual({ documentType: 'passport' });
  expect(documentationForChoice('other', saved)).toEqual(saved);
});
test('Other needs both a name and number when the player chooses to provide a document', () => {
  expect(
    documentDetailsSchemaFor().safeParse({
      documentType: 'other',
      documentName: 'Residence permit',
      documentNumber: 'P123',
    }).success,
  ).toBe(true);
  expect(
    documentDetailsSchemaFor().safeParse({ documentType: 'other', documentName: ' ' }).success,
  ).toBe(false);
  for (const documentNumber of [undefined, '', '   ']) {
    const result = documentDetailsSchemaFor().safeParse({
      documentType: 'other',
      documentName: 'Permit',
      documentNumber,
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.some((issue) => issue.path[0] === 'documentNumber')).toBe(true);
  }
  expect(documentDetailsSchemaFor().safeParse({ documentType: 'passport' }).success).toBe(false);
  expect(
    documentDetailsSchemaFor().safeParse({ documentType: 'nie', documentNumber: '123' }).success,
  ).toBe(false);
});
test('an interrupted details screen resumes directly and suppresses back entrance', () => {
  expect(wizardStepRoute('documentation-details')).toBe('/onboarding/documentation-details');
  expect(wizardStepRoute('documentation-details', 'back')).toBe(
    '/onboarding/documentation-details?entrance=none',
  );
});
