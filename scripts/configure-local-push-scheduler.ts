/**
 * Gives pg_cron the local Edge Function URL and secret API key without writing
 * either value to disk or stdout. A database reset clears Vault, so db:reset
 * runs this immediately after the migrations and seed finish.
 */

interface LocalSupabaseEnvironment {
  readonly SERVICE_ROLE_KEY: string;
}

function parseEnvironment(output: string): Partial<Record<string, string>> {
  return Object.fromEntries(
    output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const name = line.slice(0, separator);
        const rawValue = line.slice(separator + 1);
        const value = rawValue.replace(/^"|"$/g, '');
        return [name, value];
      }),
  );
}

async function readLocalSupabaseEnvironment(): Promise<LocalSupabaseEnvironment> {
  const process = Bun.spawn(['supabase', 'status', '-o', 'env'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    process.exited,
  ]);
  if (exitCode !== 0) throw new Error('Local Supabase is not running');

  const environment = parseEnvironment(stdout);
  if (environment.SERVICE_ROLE_KEY === undefined) {
    throw new Error('Local Supabase did not report its service-role key');
  }
  return { SERVICE_ROLE_KEY: environment.SERVICE_ROLE_KEY };
}

function quoteSqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function configureLocalPushScheduler(): Promise<void> {
  const environment = await readLocalSupabaseEnvironment();
  const sql = `
    delete from vault.secrets
    where name in ('push_project_url', 'push_secret_key');

    select vault.create_secret(
      'http://kong:8000',
      'push_project_url',
      'Local Edge Function gateway for the Ramassa push scheduler'
    );

    select vault.create_secret(
      ${quoteSqlLiteral(environment.SERVICE_ROLE_KEY)},
      'push_secret_key',
      'Local secret API key for the Ramassa push scheduler'
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

await configureLocalPushScheduler();

export {};
