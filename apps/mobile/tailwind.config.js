/** @type {import('tailwindcss').Config} */
// Design tokens are the single source of truth (ADR-015, RAPP-9). Tailwind loads
// this config through jiti, which transpiles the TypeScript token module, so the
// mobile theme and the admin theme derive from the exact same values. Change a
// token in packages/shared/tokens and both apps change.
const { tokens } = require('@ramassa/shared/tokens');
const { brandThemeVariables } = require('@ramassa/shared/organization-settings');

const withPixelUnit = (scale) =>
  Object.fromEntries(Object.entries(scale).map(([name, value]) => [name, `${value}px`]));

module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ...tokens.colors,
        primary: {
          DEFAULT: 'rgb(var(--ramassa-primary-rgb) / <alpha-value>)',
          light: 'rgb(var(--ramassa-primary-light-rgb) / <alpha-value>)',
          dark: 'rgb(var(--ramassa-primary-dark-rgb) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--ramassa-secondary-rgb) / <alpha-value>)',
          light: 'rgb(var(--ramassa-secondary-light-rgb) / <alpha-value>)',
          dark: 'rgb(var(--ramassa-secondary-dark-rgb) / <alpha-value>)',
        },
      },
      spacing: withPixelUnit(tokens.spacing),
      borderRadius: withPixelUnit(tokens.radius),
      fontSize: withPixelUnit(tokens.fontSize),
      lineHeight: withPixelUnit(tokens.lineHeight),
      fontFamily: tokens.fontFamily,
      // WCAG AA touch targets (hard constraint): `min-h-min`/`min-w-min` = 48dp,
      // `min-h-recommended`/`min-w-recommended` = 56dp for player-facing controls.
      minHeight: withPixelUnit(tokens.tapTarget),
      minWidth: withPixelUnit(tokens.tapTarget),
      // Ceilings the player web layout stops growing at (RAPP-80): `max-w-form`
      // for a column of inputs, `max-w-page` for a reading column. Phone-width
      // viewports never reach them.
      maxWidth: withPixelUnit(tokens.contentWidth),
    },
  },
  plugins: [
    ({ addBase }) =>
      addBase({
        ':root': brandThemeVariables({
          primaryColor: tokens.colors.primary.DEFAULT,
          secondaryColor: tokens.colors.secondary.DEFAULT,
        }),
      }),
  ],
};
