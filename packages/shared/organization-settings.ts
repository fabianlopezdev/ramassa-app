import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import { SUPPORTED_LANGUAGES } from './i18n/languages';
import { tokens } from './tokens';
import type { Database } from './types/database';

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-F]{6}$/i, 'Use a six-digit hex color such as #0077B6')
  .transform((value) => value.toUpperCase());

const nullableContactSchema = z
  .string()
  .trim()
  .max(254)
  .nullable()
  .transform((value) => (value === '' ? null : value));

export const organizationSettingsSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    contactEmail: nullableContactSchema.refine(
      (value) => value === null || z.email().safeParse(value).success,
      'Enter a valid contact email',
    ),
    contactPhone: nullableContactSchema,
    primaryColor: hexColorSchema,
    secondaryColor: hexColorSchema,
    availableLanguages: z.array(z.enum(SUPPORTED_LANGUAGES)).min(1),
    defaultLanguage: z.enum(SUPPORTED_LANGUAGES),
  })
  .superRefine((value, context) => {
    if (!value.availableLanguages.includes(value.defaultLanguage)) {
      context.addIssue({
        code: 'custom',
        path: ['defaultLanguage'],
        message: 'The default language must also be enabled',
      });
    }
    const contrast = validateBrandContrast(value);
    for (const failure of contrast.failures) {
      context.addIssue({
        code: 'custom',
        path: [failure.token === 'primary' ? 'primaryColor' : 'secondaryColor'],
        message: `${failure.token === 'primary' ? 'Primary' : 'Secondary'} color needs at least ${failure.minimum}:1 contrast with ${failure.foreground}. Current ratio: ${failure.ratio.toFixed(2)}:1.`,
      });
    }
  });

export type OrganizationSettingsInput = z.input<typeof organizationSettingsSchema>;
export type OrganizationSettings = z.output<typeof organizationSettingsSchema>;

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
  const parsed = hexColorSchema.parse(color).slice(1);
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
  const primary = hexColorSchema.parse(colors.primaryColor);
  const secondary = hexColorSchema.parse(colors.secondaryColor);
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

const organizationRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  logo_url: z.string().nullable(),
  primary_color: hexColorSchema,
  secondary_color: hexColorSchema,
  default_language: z.enum(SUPPORTED_LANGUAGES),
  available_languages: z.array(z.enum(SUPPORTED_LANGUAGES)),
  locked_default_language: z.enum(SUPPORTED_LANGUAGES).nullable(),
  contact_email: z.string().nullable(),
  contact_phone: z.string().nullable(),
});

export type OrganizationRow = z.infer<typeof organizationRowSchema>;

const staffMemberSchema = z.object({
  profile_id: z.uuid(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string(),
  role: z.enum(['staff', 'admin']),
  is_active: z.boolean(),
  invited_at: z.string().nullable(),
});

export type StaffMember = z.infer<typeof staffMemberSchema>;

const internalDocumentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  object_key: z.string(),
  content_type: z.string(),
  file_size: z.number().int(),
  uploaded_by: z.uuid(),
  uploader_name: z.string(),
  created_at: z.string(),
});

export type InternalDocument = z.infer<typeof internalDocumentSchema>;

type Client = SupabaseClient<Database>;

function databaseFailure(message: string): never {
  throw new AppError('DB-1', { message });
}

export async function fetchOrganizationSettings(client: Client): Promise<OrganizationRow> {
  const { data, error } = await client
    .from('organizations')
    .select(
      'id, name, slug, logo_url, primary_color, secondary_color, default_language, available_languages, locked_default_language, contact_email, contact_phone',
    )
    .single();
  if (error) databaseFailure(error.message);
  return organizationRowSchema.parse(data);
}

export async function saveOrganizationSettings(
  client: Client,
  input: OrganizationSettingsInput & { readonly logoUrl: string | null },
): Promise<OrganizationRow> {
  const parsed = organizationSettingsSchema.parse(input);
  const { data, error } = await client.rpc('update_organization_settings', {
    p_name: parsed.name,
    p_contact_email: parsed.contactEmail ?? '',
    p_contact_phone: parsed.contactPhone ?? '',
    p_logo_url: input.logoUrl ?? '',
    p_primary_color: parsed.primaryColor,
    p_secondary_color: parsed.secondaryColor,
    p_available_languages: parsed.availableLanguages,
    p_default_language: parsed.defaultLanguage,
  });
  if (error) databaseFailure(error.message);
  return organizationRowSchema.parse(data);
}

export async function fetchStaffMembers(client: Client): Promise<readonly StaffMember[]> {
  const { data, error } = await client.rpc('list_staff_members');
  if (error) databaseFailure(error.message);
  return z.array(staffMemberSchema).parse(data ?? []);
}

export async function inviteStaffMember(
  client: Client,
  input: {
    readonly email: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly role: 'staff' | 'admin';
  },
): Promise<{ readonly profileId: string; readonly email: string; readonly expiresAt: string }> {
  const { data, error } = await client.rpc('invite_staff_member', {
    p_email: z.email().parse(input.email.trim().toLowerCase()),
    p_first_name: z.string().trim().min(1).max(100).parse(input.firstName),
    p_last_name: z.string().trim().min(1).max(100).parse(input.lastName),
    p_role: input.role,
  });
  if (error) databaseFailure(error.message);
  const row = z
    .array(z.object({ profile_id: z.uuid(), email: z.string(), expires_at: z.string() }))
    .length(1)
    .parse(data)[0]!;
  return { profileId: row.profile_id, email: row.email, expiresAt: row.expires_at };
}

export async function setStaffMemberRole(
  client: Client,
  profileId: string,
  role: 'staff' | 'admin',
): Promise<void> {
  const { error } = await client.rpc('set_staff_member_role', {
    p_profile_id: z.uuid().parse(profileId),
    p_role: role,
  });
  if (error) databaseFailure(error.message);
}

export async function removeStaffMember(client: Client, profileId: string): Promise<void> {
  const { error } = await client.rpc('remove_staff_member', {
    p_profile_id: z.uuid().parse(profileId),
  });
  if (error) databaseFailure(error.message);
}

export async function registerInternalDocument(
  client: Client,
  input: {
    readonly objectKey: string;
    readonly name: string;
    readonly contentType: string;
    readonly fileSize: number;
  },
): Promise<string> {
  const { data, error } = await client.rpc('register_internal_document', {
    p_object_key: input.objectKey,
    p_name: z.string().trim().min(1).max(255).parse(input.name),
    p_content_type: input.contentType,
    p_file_size: z.number().int().positive().parse(input.fileSize),
  });
  if (error) databaseFailure(error.message);
  return z.uuid().parse(data);
}

export async function searchInternalDocuments(
  client: Client,
  query: string,
): Promise<readonly InternalDocument[]> {
  const { data, error } = await client.rpc('search_internal_documents', {
    p_query: query.trim(),
  });
  if (error) databaseFailure(error.message);
  return z.array(internalDocumentSchema).parse(data ?? []);
}
