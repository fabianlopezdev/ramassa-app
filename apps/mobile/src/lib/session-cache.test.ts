/**
 * The privacy boundary around cached server state (RAPP-22).
 *
 * What is actually at stake: the cached `own-profile` row is decrypted PII for
 * a refugee woman. The cases below are the four the product really produces on
 * a shared phone, plus the token refresh that must NOT count as a change.
 */

import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { expect, test } from 'bun:test';
import { dropCachedServerState, shouldDropCachedServerState } from './session-cache';

const amina = '5eed0000-0000-4000-8000-000000000001';
const fatima = '5eed0000-0000-4000-8000-000000000002';

test('the first observed session drops nothing: nothing has been fetched yet', () => {
  expect(shouldDropCachedServerState(undefined, amina)).toBe(false);
  expect(shouldDropCachedServerState(undefined, null)).toBe(false);
});

test('a token refresh on the same identity keeps the cache', () => {
  expect(shouldDropCachedServerState(amina, amina)).toBe(false);
});

test('signing out drops the cache, so the decrypted row does not outlive the session', () => {
  expect(shouldDropCachedServerState(amina, null)).toBe(true);
});

test('handing the phone to the next woman drops the previous one record', () => {
  expect(shouldDropCachedServerState(amina, fatima)).toBe(true);
});

test('signing in after a sign-out is still a change and still drops', () => {
  expect(shouldDropCachedServerState(null, fatima)).toBe(true);
});

/**
 * The predicate above decides WHETHER to drop. These two decide HOW, and they
 * exist because the first implementation got it wrong in both directions at
 * once: it called `queryClient.clear()`, which rips queries out from under
 * their observers.
 *
 * Both cases below are the same moment - the identity changes while the profile
 * read for the PREVIOUS woman is still in the air - which is not an exotic race:
 * the root layout's effect runs `null -> userId` on every start with a stored
 * session, and the profile query can easily be in flight by then.
 */
const AMINAS_ROW = 'amina-row';
const FATIMAS_ROW = 'fatima-row';

/** A client holding the previous woman's row, mid-refetch, with a live observer. */
function phoneChangingHands() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['own-profile'], AMINAS_ROW);

  let release: (() => void) | undefined;
  const held = new Promise<string>((resolve) => {
    release = () => resolve('the answer the previous fetch was waiting for');
  });
  let calls = 0;
  client.setQueryDefaults(['own-profile'], {
    queryFn: () => {
      calls += 1;
      return calls === 1 ? held : Promise.resolve(FATIMAS_ROW);
    },
  });

  const observer = new QueryObserver(client, { queryKey: ['own-profile'] });
  const unsubscribe = observer.subscribe(() => undefined);
  return { client, observer, release: () => release?.(), stop: unsubscribe };
}

test('a read still in flight when the phone changes hands does not strand the screen', async () => {
  // Deliberately NOT `phoneChangingHands()`: that one pre-seeds a cached row,
  // and with one present the observer settles on the STALE row rather than
  // hanging, so this assertion could not fail (it passed against `clear()`
  // while `clear()` was demonstrably stranding the real screen).
  //
  // The stranding needs the FIRST fetch to be the one in flight, which is the
  // real case: a fresh start, nothing cached yet, the root layout's
  // `null -> userId` effect firing while the profile read is still out.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let release: (() => void) | undefined;
  const held = new Promise<string>((resolve) => {
    release = () => resolve(FATIMAS_ROW);
  });
  client.setQueryDefaults(['own-profile'], { queryFn: () => held });

  const observer = new QueryObserver(client, { queryKey: ['own-profile'] });
  const stop = observer.subscribe(() => undefined);
  await Bun.sleep(20);
  expect(observer.getCurrentResult().status).toBe('pending');

  dropCachedServerState(client);
  release?.();
  await Bun.sleep(300);

  // Still `pending` here is the profile tab sitting on skeletons that never
  // become anything, which is what two Android flows failed on.
  expect(observer.getCurrentResult().status).toBe('success');
  stop();
});

test('the next woman is never handed the previous one row', async () => {
  const { client, observer, release, stop } = phoneChangingHands();
  await Bun.sleep(20);

  dropCachedServerState(client);
  // Gone from the cache the instant the identity changes, not one tick later.
  expect(client.getQueryData(['own-profile'])).toBeUndefined();

  release();
  await Bun.sleep(300);

  // And it must not come BACK: `clear()` let the observer settle holding the row
  // it had before the change, which is the leak this whole boundary exists for.
  expect(observer.getCurrentResult().data).toBe(FATIMAS_ROW);
  stop();
});
