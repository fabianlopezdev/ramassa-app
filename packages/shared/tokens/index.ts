/**
 * Design tokens: the single source of truth for every color, dimension, and
 * typographic value in both apps (ADR-015). No component, config, or stylesheet
 * anywhere in the codebase may hardcode a hex code, pixel value, or radius. They
 * reference these tokens instead. Change a value here and it changes everywhere.
 *
 * Consumed by the mobile NativeWind config (`apps/mobile/tailwind.config.js`) and
 * the admin Tailwind theme (`apps/admin/src/styles/app.css` via the vite plugin
 * that calls `tokensToCssVariables`). White-label organizations override the
 * `primary` and `secondary` palettes at runtime from the `organizations` table.
 */

export const tokens = {
  colors: {
    // Club identity: blue primary, gold secondary.
    primary: { DEFAULT: '#0077B6', light: '#4DA8DA', dark: '#005A8C' },
    secondary: { DEFAULT: '#FFD166', light: '#FFE08A', dark: '#E6B84D' },

    // Semantic status roles. Never communicate state with color alone (WCAG AA):
    // always pair with an icon or text label.
    success: '#06D6A0',
    warning: '#FFD166',
    error: '#EF476F',
    info: '#118AB2',

    // Neutral ramp for text, surfaces, and borders.
    neutral: {
      50: '#F8FAFC',
      100: '#F1F5F9',
      200: '#E2E8F0',
      300: '#CBD5E1',
      400: '#94A3B8',
      500: '#64748B',
      600: '#475569',
      700: '#334155',
      800: '#1E293B',
      900: '#0F172A',
    },

    white: '#FFFFFF',
    black: '#000000',
  },

  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48, '3xl': 64 },

  radius: { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 },

  fontSize: { xs: 12, sm: 14, md: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36 },

  // Font families are named here; the actual font files (which must render Arabic
  // and Farsi as a first-class concern, per the SPEC Design Direction) are bundled
  // per app. `sans` is the Latin/Cyrillic default; `arabic` and `farsi` carry the
  // RTL scripts so the language switch can select the right family at runtime.
  fontFamily: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    arabic: ['Noto Kufi Arabic', 'Noto Sans Arabic', 'sans-serif'],
    farsi: ['Vazirmatn', 'Noto Sans Arabic', 'sans-serif'],
  },

  // Minimum and recommended touch-target sizes (WCAG AA / hard constraint). Every
  // interactive element is at least `min`; player-facing controls aim for `recommended`.
  tapTarget: { min: 48, recommended: 56 },

  // Client-side upload ceilings, enforced before the R2 upload (ADR-013).
  upload: { maxImageBytes: 1_048_576, maxVideoBytes: 10_485_760 },

  // Number of flags that auto-hides a forum post pending moderation (ADR-014).
  forum: { autoHideFlagThreshold: 3 },
} as const;

export type Tokens = typeof tokens;

type TokenLeaf = string | number | readonly string[];
type TokenTree = { readonly [key: string]: TokenLeaf | TokenTree };

/**
 * Flattens the token tree into CSS custom properties for the Tailwind v4 admin,
 * which is CSS-first and cannot import a TypeScript object directly. Nested keys
 * become kebab-cased segments; numeric dimensions gain a `px` unit, unitless
 * ratios (like `forum.autoHideFlagThreshold`) stay raw, and font-family arrays
 * join into a single font stack.
 *
 * `tokens.colors.primary.DEFAULT` -> `--ramassa-color-primary`
 * `tokens.radius.lg`              -> `--ramassa-radius-lg: 16px`
 * `tokens.spacing.md`             -> `--ramassa-spacing-md: 16px`
 *
 * Returns the declarations wrapped in a `:root { ... }` rule.
 */
export function tokensToCssVariables(source: TokenTree = tokens, prefix = 'ramassa'): string {
  const declarations: string[] = [];

  const dimensionGroups = new Set(['spacing', 'radius', 'fontSize', 'tapTarget']);

  const walk = (value: unknown, path: string[], group: string | null): void => {
    if (Array.isArray(value)) {
      declarations.push(`  --${[prefix, ...path].join('-')}: ${value.join(', ')};`);
      return;
    }

    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        // A `DEFAULT` child collapses onto its parent's name (Tailwind convention),
        // so `colors.primary.DEFAULT` -> `--ramassa-color-primary`.
        const nextPath = key === 'DEFAULT' ? path : [...path, kebabCase(key)];
        walk(child, nextPath, group ?? key);
      }
      return;
    }

    const unit =
      typeof value === 'number' && group !== null && dimensionGroups.has(group) ? 'px' : '';
    declarations.push(`  --${[prefix, ...path].join('-')}: ${String(value)}${unit};`);
  };

  // The `colors` group is renamed to the singular `color` prefix so variables read
  // as `--ramassa-color-primary` rather than `--ramassa-colors-primary`.
  for (const [group, value] of Object.entries(source)) {
    const groupName = group === 'colors' ? 'color' : kebabCase(group);
    walk(value, [groupName], group);
  }

  return `:root {\n${declarations.join('\n')}\n}\n`;
}

function kebabCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}
