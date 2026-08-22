import { describe, expect, test } from 'bun:test';
import {
  brandThemeVariables,
  contrastRatio,
  organizationSettingsSchema,
  validateBrandContrast,
} from './organization-settings';

describe('organization branding contrast', () => {
  test('accepts the Ramassa defaults at WCAG AA and reports their ratios', () => {
    const result = validateBrandContrast({
      primaryColor: '#0077B6',
      secondaryColor: '#FFD166',
    });

    expect(result.ok).toBe(true);
    expect(result.primaryRatio).toBeGreaterThanOrEqual(4.5);
    expect(result.secondaryRatio).toBeGreaterThanOrEqual(4.5);
  });

  test('rejects a primary color that cannot carry white text with a helpful result', () => {
    const result = validateBrandContrast({
      primaryColor: '#F8FAFC',
      secondaryColor: '#FFD166',
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({ token: 'primary', foreground: '#FFFFFF', minimum: 4.5 }),
    ]);
  });

  test('uses the WCAG relative-luminance formula rather than a color-distance shortcut', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBe(21);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.478, 2);
  });
});

describe('organization settings contract', () => {
  test('propagates both colors through every runtime token consumed by admin and player apps', () => {
    const variables = brandThemeVariables({
      primaryColor: '#005A8C',
      secondaryColor: '#FFE08A',
    });

    expect(variables).toMatchObject({
      '--ramassa-color-primary': '#005A8C',
      '--ramassa-color-secondary': '#FFE08A',
      '--ramassa-primary-rgb': '0 90 140',
      '--ramassa-secondary-rgb': '255 224 138',
    });
    expect(variables['--ramassa-color-primary-light']).not.toBe('#005A8C');
    expect(variables['--ramassa-color-primary-dark']).not.toBe('#005A8C');
  });

  test('allows only the five supported languages and requires the default to stay enabled', () => {
    expect(
      organizationSettingsSchema.safeParse({
        name: 'AE Ramassà',
        contactEmail: 'contacte@example.test',
        contactPhone: '+34 600 000 000',
        primaryColor: '#0077B6',
        secondaryColor: '#FFD166',
        availableLanguages: ['ca', 'es', 'ar'],
        defaultLanguage: 'ca',
      }).success,
    ).toBe(true);

    expect(
      organizationSettingsSchema.safeParse({
        name: 'AE Ramassà',
        contactEmail: null,
        contactPhone: null,
        primaryColor: '#0077B6',
        secondaryColor: '#FFD166',
        availableLanguages: ['es', 'en'],
        defaultLanguage: 'ca',
      }).success,
    ).toBe(false);
  });
});
