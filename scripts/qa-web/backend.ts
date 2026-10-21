/** Keep browser QA's app servers, mail and SQL on the same local stack. */
export function qaBackend(env: Readonly<Record<string, string | undefined>>) {
  const localOrigin = (value: string): string => {
    const url = new URL(value);
    if (
      url.protocol !== 'http:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username !== '' ||
      url.password !== '' ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== ''
    )
      throw new Error('Browser QA requires a local HTTP backend origin');
    return url.origin;
  };
  const databaseContainer = env.RAMASSA_QA_DB_CONTAINER ?? 'supabase_db_ramassa';
  if (!/^supabase_db_[a-z0-9-]+$/.test(databaseContainer)) {
    throw new Error('Invalid local Supabase database container');
  }
  return {
    supabaseUrl: localOrigin(env.RAMASSA_QA_SUPABASE_URL ?? 'http://127.0.0.1:54321'),
    mailpitUrl: localOrigin(env.RAMASSA_QA_MAILPIT_URL ?? 'http://127.0.0.1:54324'),
    databaseContainer,
  };
}
