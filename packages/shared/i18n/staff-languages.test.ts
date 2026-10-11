import { describe, expect, test } from 'bun:test';
import { STAFF_LANGUAGES, staffLanguageFor } from './languages';

describe('staff-side languages (RAPP-238)', () => {
  test('the staff side offers Catalan, Spanish and English', () => {
    expect([...STAFF_LANGUAGES]).toEqual(['ca', 'es', 'en']);
  });

  test('a staff language stays; Arabic and Farsi become Catalan', () => {
    expect(staffLanguageFor('es')).toBe('es');
    expect(staffLanguageFor('en')).toBe('en');
    expect(staffLanguageFor('ca')).toBe('ca');
    expect(staffLanguageFor('ar')).toBe('ca');
    expect(staffLanguageFor('fa')).toBe('ca');
  });
});
