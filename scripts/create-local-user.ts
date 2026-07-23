/**
 * Creates a user in the LOCAL Supabase stack for hands-on testing (RAPP-13).
 *
 * Login is invite-only by design (`shouldCreateUser: false`, ADR-005), and the
 * staff UI that provisions accounts is Phase 2 (RAPP-25) — so until then there
 * is no way to sign in locally without this. It creates the `auth.users` row
 * (email pre-confirmed) plus the matching `profiles` row that carries the role
 * the apps gate on.
 *
 * Nothing here is committed as data: it writes to your local Docker Postgres
 * only. It refuses to run against anything that is not localhost, so it can
 * never touch the Frankfurt project.
 *
 * Usage (from the repo root, with `bunx supabase start` running):
 *   bun run scripts/create-local-user.ts <email> <role> [password]
 *   bun run scripts/create-local-user.ts me+staff@example.com staff
 *   bun run scripts/create-local-user.ts me+player@example.com player
 *
 * Roles: player | staff | admin | entity   (default password: ramassa-dev-pass)
 */

const DEMO_ORG_ID = '00000000-0000-0000-0000-0000000000a1'; // seeded in supabase/seed.sql
const DEFAULT_PASSWORD = 'ramassa-dev-pass';
const VALID_ROLES = ['player', 'staff', 'admin', 'entity'] as const;

const [email, role, password = DEFAULT_PASSWORD] = process.argv.slice(2);
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!email || !role) {
  fail('Usage: bun run scripts/create-local-user.ts <email> <role> [password]');
}
if (!VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
  fail(`Role must be one of: ${VALID_ROLES.join(', ')} (got "${role}")`);
}
if (!supabaseUrl || !serviceRoleKey) {
  fail('EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env).');
}
// Hard safety rail: local Docker stack only, never a remote project.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(supabaseUrl.replace(/\/$/, ''))) {
  fail(`Refusing to run against a non-local Supabase URL: ${supabaseUrl}`);
}

const authHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
};

const createUserResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
  method: 'POST',
  headers: authHeaders,
  // email_confirm skips the confirmation step so the account is usable at once.
  body: JSON.stringify({ email, password, email_confirm: true }),
});
const createdUser = (await createUserResponse.json()) as { id?: string; msg?: string };

if (!createUserResponse.ok || !createdUser.id) {
  fail(`Could not create the auth user: ${createdUser.msg ?? JSON.stringify(createdUser)}`);
}

const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
  method: 'POST',
  headers: { ...authHeaders, Prefer: 'resolution=merge-duplicates' },
  body: JSON.stringify({
    id: createdUser.id,
    org_id: DEMO_ORG_ID,
    role,
    first_name: 'Local',
    last_name: 'Tester',
    preferred_language: 'ca',
  }),
});

if (!profileResponse.ok) {
  fail(`Auth user created, but the profile row failed: ${await profileResponse.text()}`);
}

console.log(`\n✓ Local ${role} ready\n  email:    ${email}\n  password: ${password}`);
console.log(`  magic links arrive in Mailpit: http://127.0.0.1:54324\n`);
