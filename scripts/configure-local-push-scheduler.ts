/**
 * Gives pg_cron the local Edge Function URL and an invocation-only secret without
 * writing either value to disk or stdout. A database reset clears Vault, so db:reset
 * runs this immediately after the migrations and seed finish.
 */

export function createDispatchSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function quoteSqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function configureLocalPushScheduler(): Promise<void> {
  const dispatchSecret = createDispatchSecret();
  const sql = `
    delete from vault.secrets
    where name in ('push_project_url', 'push_dispatch_secret');

    select vault.create_secret(
      'http://kong:8000',
      'push_project_url',
      'Local Edge Function gateway for the Ramassa push scheduler'
    );

    select vault.create_secret(
      ${quoteSqlLiteral(dispatchSecret)},
      'push_dispatch_secret',
      'Local invocation-only secret for the Ramassa push scheduler'
    );
  `;

  const process = Bun.spawn(
    [
      'docker',
      'exec',
      '--interactive',
      'supabase_db_ramassa',
      'psql',
      '--username',
      'postgres',
      '--dbname',
      'postgres',
      '--no-psqlrc',
      '--quiet',
      '--set',
      'ON_ERROR_STOP=1',
    ],
    {
      stdin: new Blob([sql]),
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [, exitCode] = await Promise.all([new Response(process.stderr).text(), process.exited]);
  if (exitCode !== 0) throw new Error('Could not configure local push scheduler');

  console.info('Local push scheduler configured in Supabase Vault.');
}

if (import.meta.main) await configureLocalPushScheduler();
