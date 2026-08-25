import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';
import { ACCESS_CODE_ALPHABET } from '@ramassa/shared/auth';

const migration = readFileSync(
  'supabase/migrations/20260801170000_admin_account_creation.sql',
  'utf8',
);

test('the SQL generator and TypeScript canonicalizer share one unambiguous alphabet', () => {
  expect(migration).toContain(`'${ACCESS_CODE_ALPHABET}'`);
});

test('creation uses group one as the identifier and the complete 4-4-4 code as the password', () => {
  expect(migration).toContain(
    "generated_email := split_part(generated_access_code, '-', 1) || '@ramassa.invalid';",
  );
  expect(migration).toContain("extensions.crypt(generated_access_code, extensions.gen_salt('bf'))");
  expect(migration).toContain(
    'return query select new_user_id, generated_email, generated_access_code;',
  );
});

test('reset retains group one and replaces only the two secret groups', () => {
  expect(migration).toContain("split_part(u.email, '@', 1)");
  expect(migration).toContain(
    "generated_access_code := stable_identifier || '-' ||\n    public.unambiguous_token(4) || '-' ||\n    public.unambiguous_token(4);",
  );
  expect(migration).toContain(
    "encrypted_password = extensions.crypt(generated_access_code, extensions.gen_salt('bf'))",
  );
});
