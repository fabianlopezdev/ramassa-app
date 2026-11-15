import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { HEX_COLOR_MESSAGE, HEX_COLOR_PATTERN, validateBrandContrast } from './brand-theme';
import { AppError, databaseErrorCode } from './errors';
import { SUPPORTED_LANGUAGES } from './i18n/languages';
import { personNameSchema } from './schemas/person-name';
import type { Database } from './types/database';

// The brand color helpers live in a zod-free module the mobile Tailwind config can load.
export {
  brandThemeVariables,
  contrastRatio,
  validateBrandContrast,
  type BrandColors,
  type BrandContrastResult,
  type BrandThemeVariables,
  type ContrastFailure,
} from './brand-theme';

const hexColorSchema = z
  .string()
  .trim()
  .regex(HEX_COLOR_PATTERN, HEX_COLOR_MESSAGE)
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
  /** A test account signs in with the staging fixed code (RAPP-615, RAPP-616). */
  is_test_account: z.boolean(),
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

const publicOrganizationBrandingSchema = z.object({
  primary_color: hexColorSchema,
  secondary_color: hexColorSchema,
});

export type PublicOrganizationBranding = z.infer<typeof publicOrganizationBrandingSchema>;

export async function fetchPublicOrganizationBranding(
  client: Client,
  organizationSlug: string,
): Promise<PublicOrganizationBranding | null> {
  const { data, error } = await client.rpc('get_public_organization_branding', {
    organization_slug: organizationSlug,
  });
  if (error) databaseFailure(error.message);
  const rows = z.array(publicOrganizationBrandingSchema).max(1).parse(data);
  return rows[0] ?? null;
}

function databaseFailure(message: string): never {
  throw new AppError(databaseErrorCode(message), { message });
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
    p_first_name: personNameSchema.parse(input.firstName),
    p_last_name: personNameSchema.parse(input.lastName),
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

/**
 * Marks a team account as a test account, or back (RAPP-615). Team accounts
 * only: the database refuses a player, and it audits the change.
 */
export async function setTeamMemberTestAccount(
  client: Client,
  profileId: string,
  isTestAccount: boolean,
): Promise<void> {
  const { error } = await client.rpc('set_team_member_test_account', {
    p_profile_id: z.uuid().parse(profileId),
    p_is_test_account: isTestAccount,
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
