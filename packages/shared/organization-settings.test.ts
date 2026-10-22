import { describe, expect, test } from 'bun:test';
import {
  brandThemeVariables,
  contrastRatio,
  fetchStaffMembers,
  organizationSettingsSchema,
  setTeamMemberTestAccount,
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

describe('test team accounts (RAPP-615)', () => {
  const MEMBER = '5eed0000-0000-4000-8000-000000000097';

  test('the team list carries the test account flag', async () => {
    const client = {
      rpc: () =>
        Promise.resolve({
          data: [
            {
              profile_id: MEMBER,
              first_name: 'Pau',
              last_name: 'Dissenya',
              email: 'disseny@example.test',
              role: 'staff',
              is_active: true,
              invited_at: null,
              is_test_account: true,
            },
          ],
          error: null,
        }),
    } as never;
    const [member] = await fetchStaffMembers(client);
    expect(member?.is_test_account).toBe(true);
  });

  test('marking an account calls the audited RPC with her id and the flag', async () => {
    const calls: { name: string; args: unknown }[] = [];
    const client = {
      rpc: (name: string, args: unknown) => {
        calls.push({ name, args });
        return Promise.resolve({ data: null, error: null });
      },
    } as never;
    await setTeamMemberTestAccount(client, MEMBER, true);
    expect(calls).toEqual([
      {
        name: 'set_team_member_test_account',
        args: { p_profile_id: MEMBER, p_is_test_account: true },
      },
    ]);
  });

  test('a refusal arrives as a typed error', async () => {
    const client = {
      rpc: () =>
        Promise.resolve({ data: null, error: { message: 'PERMISSIONS/TEAM_MANAGE_REQUIRED' } }),
    } as never;
    await expect(setTeamMemberTestAccount(client, MEMBER, false)).rejects.toMatchObject({
      code: expect.any(String),
    });
  });
});
