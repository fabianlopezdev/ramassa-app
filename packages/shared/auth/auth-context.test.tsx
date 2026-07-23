import type { SupabaseClient } from '@supabase/supabase-js';
import { act, render, waitFor } from '@testing-library/react';
import { expect, test } from 'bun:test';
import type { Database } from '../types/database';
import { AuthProvider, useAuth } from './auth-context';

type AuthChangeCallback = (event: string, session: unknown) => void;

function makeClient(options: { initialSession: unknown; role: string }) {
  let onChange: AuthChangeCallback = () => {};
  const client = {
    auth: {
      getSession: async () => ({ data: { session: options.initialSession } }),
      onAuthStateChange: (callback: AuthChangeCallback) => {
        onChange = callback;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { role: options.role }, error: null }) }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
  return { client, emit: (session: unknown) => onChange('SIGNED_IN', session) };
}

// This package compiles without DOM lib types (it is platform-neutral), so the
// rendered element's text is read through a minimal structural type.
function textContentOf(element: unknown): string | null {
  return (element as { textContent: string | null }).textContent;
}

function AuthProbe() {
  const { role, isLoading, session } = useAuth();
  const state = `${isLoading ? 'loading' : 'ready'}|${session ? 'in' : 'out'}|${role ?? 'none'}`;
  return <span data-testid="probe">{state}</span>;
}

test('resolves an existing session and reads its role from the profile', async () => {
  const { client } = makeClient({ initialSession: { user: { id: 'u1' } }, role: 'player' });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <AuthProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(textContentOf(getByTestId('probe'))).toBe('ready|in|player'));
});

test('with no session, finishes loading as signed out', async () => {
  const { client } = makeClient({ initialSession: null, role: 'player' });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <AuthProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(textContentOf(getByTestId('probe'))).toBe('ready|out|none'));
});

test('a sign-out event clears the session and role', async () => {
  const { client, emit } = makeClient({ initialSession: { user: { id: 'u1' } }, role: 'staff' });
  const { getByTestId } = render(
    <AuthProvider client={client}>
      <AuthProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(textContentOf(getByTestId('probe'))).toBe('ready|in|staff'));

  await act(async () => {
    emit(null);
  });
  await waitFor(() => expect(textContentOf(getByTestId('probe'))).toBe('ready|out|none'));
});
