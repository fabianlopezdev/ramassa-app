import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'bun:test';

describe('email OTP security contract', () => {
  test('auth never transports bearer tokens through the custom app scheme', async () => {
    const [actions, mobileAuth, adminAuth, supabaseConfig] = await Promise.all([
      readFile('packages/shared/auth/auth-actions.ts', 'utf8'),
      readFile('apps/mobile/src/lib/auth.ts', 'utf8'),
      readFile('apps/admin/src/lib/auth.ts', 'utf8'),
      readFile('supabase/config.toml', 'utf8'),
    ]);

    expect(actions).not.toContain('setSession');
    expect(actions).not.toContain('access_token');
    expect(mobileAuth).not.toContain('auth/callback');
    expect(adminAuth).not.toContain('auth/callback');
    expect(supabaseConfig).not.toContain('ramassa://auth/callback');
  });

  test('the email template presents a one-time code instead of a login URL', async () => {
    const template = await readFile('supabase/templates/magic_link.html', 'utf8');
    const clientFactory = await readFile('packages/shared/lib/supabase.ts', 'utf8');

    expect(template).toContain('{{ .Token }}');
    expect(template).not.toContain('{{ .ConfirmationURL }}');
    expect(clientFactory).toContain("flowType: 'pkce'");
  });
});
