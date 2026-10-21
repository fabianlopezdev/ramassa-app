/**
 * Whether the caller may delete this person as a TEST player (RAPP-617).
 *
 * Asked of Postgres with the caller's OWN token, like the permission read in
 * `supabase-identity.ts`: `is_deletable_test_player` answers true only for a
 * test player of the caller's organization and a caller with
 * test_players.manage or rgpd.erase. This Worker holds no key that could ask
 * on anybody else's behalf, and anything but a clear true is a no.
 */

export async function isDeletableTestPlayer(options: {
  readonly participantId: string;
  readonly token: string;
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
  readonly fetchImplementation?: typeof fetch;
}): Promise<boolean> {
  // Called as a plain function: the Workers runtime refuses `fetch` with any
  // other `this` ("Illegal invocation").
  const performFetch = options.fetchImplementation ?? fetch;
  const response = await performFetch(
    `${options.supabaseUrl}/rest/v1/rpc/is_deletable_test_player`,
    {
      method: 'POST',
      headers: {
        apikey: options.supabasePublishableKey,
        Authorization: `Bearer ${options.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_profile_id: options.participantId }),
    },
  );
  if (!response.ok) return false;
  return (await response.json()) === true;
}
