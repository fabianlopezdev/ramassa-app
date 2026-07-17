/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    // RAPP-9 hook point: shared design tokens from packages/shared/tokens
    // will be spread into `extend` here once that package exists.
    extend: {},
  },
  plugins: [],
};
