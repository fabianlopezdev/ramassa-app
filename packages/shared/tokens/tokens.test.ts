import { expect, test } from 'bun:test';
import { tokens, tokensToCssVariables } from './index';

test('tokens expose the full expected shape', () => {
  expect(tokens.colors.primary.DEFAULT).toBe('#0077B6');
  expect(tokens.colors.secondary.DEFAULT).toBe('#FFD166');
  expect(Object.keys(tokens.colors.neutral)).toHaveLength(10);
  expect(tokens.radius.lg).toBe(16);
  expect(tokens.spacing.md).toBe(16);
  expect(tokens.fontSize.md).toBe(16);
  expect(tokens.fontFamily.arabic.length).toBeGreaterThan(0);
  expect(tokens.fontFamily.farsi.length).toBeGreaterThan(0);
});

test('touch targets meet the WCAG AA hard constraint (min 48dp, recommended 56dp)', () => {
  expect(tokens.tapTarget.min).toBeGreaterThanOrEqual(48);
  expect(tokens.tapTarget.recommended).toBeGreaterThanOrEqual(56);
});

test('tokensToCssVariables derives CSS custom properties from the tokens', () => {
  const css = tokensToCssVariables();

  // A `DEFAULT` child collapses onto its parent, and `colors` becomes `color`.
  expect(css).toContain('--ramassa-color-primary: #0077B6;');
  expect(css).toContain('--ramassa-color-secondary: #FFD166;');
  expect(css).toContain('--ramassa-color-primary-dark: #005A8C;');
  expect(css).toContain('--ramassa-color-neutral-900: #0F172A;');

  // Dimensions carry a px unit; unitless thresholds do not.
  expect(css).toContain('--ramassa-radius-lg: 16px;');
  expect(css).toContain('--ramassa-spacing-md: 16px;');
  expect(css).toContain('--ramassa-tap-target-recommended: 56px;');
  expect(css).toContain('--ramassa-forum-auto-hide-flag-threshold: 3;');

  expect(css.startsWith(':root {')).toBe(true);
});

test('changing a token changes its derived CSS variable (single source of truth)', () => {
  const custom = {
    ...tokens,
    colors: {
      ...tokens.colors,
      primary: { DEFAULT: '#123456', light: '#abcdef', dark: '#000000' },
    },
  };
  expect(tokensToCssVariables(custom)).toContain('--ramassa-color-primary: #123456;');
});
