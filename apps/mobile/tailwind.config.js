/** @type {import('tailwindcss').Config} */
// Design tokens are the single source of truth (ADR-015, RAPP-9). Tailwind loads
// this config through jiti, which transpiles the TypeScript token module, so the
// mobile theme and the admin theme derive from the exact same values. Change a
// token in packages/shared/tokens and both apps change.
const { tokens } = require('@ramassa/shared/tokens');

const withPixelUnit = (scale) =>
  Object.fromEntries(Object.entries(scale).map(([name, value]) => [name, `${value}px`]));

module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: tokens.colors,
      spacing: withPixelUnit(tokens.spacing),
      borderRadius: withPixelUnit(tokens.radius),
      fontSize: withPixelUnit(tokens.fontSize),
      fontFamily: tokens.fontFamily,
      // WCAG AA touch targets (hard constraint): `min-h-min`/`min-w-min` = 48dp,
      // `min-h-recommended`/`min-w-recommended` = 56dp for player-facing controls.
      minHeight: withPixelUnit(tokens.tapTarget),
      minWidth: withPixelUnit(tokens.tapTarget),
    },
  },
  plugins: [],
};
