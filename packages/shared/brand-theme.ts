/**
 * The organization's brand colors as themes read them (RAPP-784): contrast
 * checks and the CSS variables both apps and the mobile Tailwind config use.
 *
 * Zod-free on purpose. Tailwind 3 loads the NativeWind config through its own
 * jiti, which reads zod 4.6 and later as undefined, so nothing this module
 * imports may reach zod. `apps/mobile/tailwind.config.test.ts` loads the config that way.
 * The settings form validates the same colors with zod in
 * `organization-settings.ts`, built on `HEX_COLOR_PATTERN` from here.
 */
import { AppError } from './errors/runtime';
import { tokens } from './tokens';

/** A six-digit hex color such as #0077B6: one pattern for the form and the theme. */
export const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;

export const HEX_COLOR_MESSAGE = 'Use a six-digit hex color such as #0077B6';

/** The color trimmed and in capitals; anything else is refused, as the settings form does. */
function normalizeHexColor(color: string): string {
  const value = color.trim();
  if (!HEX_COLOR_PATTERN.test(value)) {
    throw new AppError('VALIDATION-1', { message: HEX_COLOR_MESSAGE });
  }
  return value.toUpperCase();
}

export interface BrandColors {
  readonly primaryColor: string;
  readonly secondaryColor: string;
}

export interface ContrastFailure {
  readonly token: 'primary' | 'secondary';
  readonly foreground: string;
  readonly ratio: number;
  readonly minimum: 4.5;
}

export interface BrandContrastResult {
  readonly ok: boolean;
  readonly primaryRatio: number;
  readonly secondaryRatio: number;
  readonly failures: readonly ContrastFailure[];
}

function colorChannels(color: string): readonly [number, number, number] {
  const parsed = normalizeHexColor(color).slice(1);
  return [
    Number.parseInt(parsed.slice(0, 2), 16),
    Number.parseInt(parsed.slice(2, 4), 16),
    Number.parseInt(parsed.slice(4, 6), 16),
  ];
}

function linearChannel(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = colorChannels(color).map(linearChannel);
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

/** WCAG 2.2 relative-luminance contrast ratio, in the inclusive range 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Primary controls carry white text; secondary controls carry the darkest neutral.
 * Those foregrounds are fixed across both apps, so both editable backgrounds must
 * meet the normal-text AA threshold before the setting can be saved.
 */
export function validateBrandContrast(colors: BrandColors): BrandContrastResult {
  const primaryRatio = contrastRatio(colors.primaryColor, tokens.colors.white);
  const secondaryRatio = contrastRatio(colors.secondaryColor, tokens.colors.neutral[900]);
  const failures: ContrastFailure[] = [];
  if (primaryRatio < 4.5) {
    failures.push({
      token: 'primary',
      foreground: tokens.colors.white,
      ratio: primaryRatio,
      minimum: 4.5,
    });
  }
  if (secondaryRatio < 4.5) {
    failures.push({
      token: 'secondary',
      foreground: tokens.colors.neutral[900],
      ratio: secondaryRatio,
      minimum: 4.5,
    });
  }
  return { ok: failures.length === 0, primaryRatio, secondaryRatio, failures };
}

function mixHex(color: string, target: '#000000' | '#FFFFFF', amount: number): string {
  const source = colorChannels(color);
  const destination = colorChannels(target);
  const channels = source.map((channel, index) =>
    Math.round(channel + (destination[index]! - channel) * amount),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export type BrandThemeVariables = Readonly<Record<`--ramassa-${string}`, string>>;

/** Runtime variables consumed by admin CSS and NativeWind's inherited theme. */
export function brandThemeVariables(colors: BrandColors): BrandThemeVariables {
  const primary = normalizeHexColor(colors.primaryColor);
  const secondary = normalizeHexColor(colors.secondaryColor);
  const primaryLight = mixHex(primary, '#FFFFFF', 0.3);
  const primaryDark = mixHex(primary, '#000000', 0.25);
  const secondaryLight = mixHex(secondary, '#FFFFFF', 0.3);
  const secondaryDark = mixHex(secondary, '#000000', 0.15);
  return {
    '--ramassa-color-primary': primary,
    '--ramassa-color-primary-light': primaryLight,
    '--ramassa-color-primary-dark': primaryDark,
    '--ramassa-color-secondary': secondary,
    '--ramassa-color-secondary-light': secondaryLight,
    '--ramassa-color-secondary-dark': secondaryDark,
    '--ramassa-primary-rgb': colorChannels(primary).join(' '),
    '--ramassa-primary-light-rgb': colorChannels(primaryLight).join(' '),
    '--ramassa-primary-dark-rgb': colorChannels(primaryDark).join(' '),
    '--ramassa-secondary-rgb': colorChannels(secondary).join(' '),
    '--ramassa-secondary-light-rgb': colorChannels(secondaryLight).join(' '),
    '--ramassa-secondary-dark-rgb': colorChannels(secondaryDark).join(' '),
  };
}
