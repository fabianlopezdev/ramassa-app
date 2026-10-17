import { describe, expect, test } from 'bun:test';
import { authorizationContentSchema } from '@ramassa/shared/authorization';
import { buildAuthorizationVersion } from '@ramassa/shared/testing';
import {
  endSigningSession,
  readAuthorizationForSigning,
  readSigningSession,
  saveAuthorizationForSigning,
  startSigningSession,
} from './signing-mode';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getString(key: string) {
    return this.values.get(key);
  }
  set(key: string, value: string) {
    this.values.set(key, value);
  }
  remove(key: string) {
    return this.values.delete(key);
  }
}

describe('signing session', () => {
  test('survives a restart, so a cold start opens signing mode again', () => {
    const storage = new MemoryStorage();
    startSigningSession(storage, 'coach-1', { kind: 'player', profileId: 'p-22', name: 'Наталія' });
    expect(readSigningSession(storage, 'coach-1')?.signer).toEqual({
      kind: 'player',
      profileId: 'p-22',
      name: 'Наталія',
    });
    endSigningSession(storage);
    expect(readSigningSession(storage, 'coach-1')).toBeNull();
  });

  test("is only the coach's own: nobody else, and nobody signed out, is in signing mode", () => {
    const storage = new MemoryStorage();
    startSigningSession(storage, 'coach-1', {
      kind: 'walk_in',
      firstName: 'Rim',
      lastName: 'Haddad',
    });
    expect(readSigningSession(storage, 'coach-2')).toBeNull();
    expect(readSigningSession(storage, null)).toBeNull();
  });

  test('a damaged session reads as none', () => {
    const storage = new MemoryStorage();
    storage.set('ramassa.signing-mode.v1', '{"ownerId":"coach-1"');
    expect(readSigningSession(storage, 'coach-1')).toBeNull();
  });
});

describe('the version kept for offline signing', () => {
  test('is read back as it was saved, and removed when none is published', () => {
    const storage = new MemoryStorage();
    const version = buildAuthorizationVersion();
    const authorization = {
      versionId: version.id,
      seasonName: '2026/27',
      versionNumber: 1,
      content: authorizationContentSchema.parse(version.content),
    };
    saveAuthorizationForSigning(storage, 'coach-1', authorization);
    expect(readAuthorizationForSigning(storage, 'coach-1')).toEqual(authorization);
    expect(readAuthorizationForSigning(storage, 'coach-2')).toBeNull();
    saveAuthorizationForSigning(storage, 'coach-1', null);
    expect(readAuthorizationForSigning(storage, 'coach-1')).toBeNull();
  });
});
