import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

const root = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('secure mobile storage configuration', () => {
  test('Expo dependencies and Android backup opt-out are explicit', () => {
    const packageJson = JSON.parse(read('apps/mobile/package.json')) as {
      dependencies: Record<string, string>;
    };
    const appJson = JSON.parse(read('apps/mobile/app.json')) as {
      expo: { android: { allowBackup?: boolean }; plugins: unknown[] };
    };

    expect(packageJson.dependencies['expo-secure-store']).toBe('~57.0.1');
    expect(packageJson.dependencies['expo-crypto']).toBe('~57.0.1');
    expect(appJson.expo.android.allowBackup).toBe(false);
    expect(JSON.stringify(appJson.expo.plugins)).toContain('expo-secure-store');
    expect(JSON.stringify(appJson.expo.plugins)).toContain('with-secure-backup-rules');
  });

  test('backup rules exclude app data from cloud backup and device transfer', () => {
    const plugin = read('apps/mobile/plugins/with-secure-backup-rules.cjs');

    expect(plugin).toContain('android:allowBackup');
    expect(plugin).toContain('android:fullBackupContent');
    expect(plugin).toContain('android:dataExtractionRules');
    expect(plugin).toContain('<cloud-backup');
    expect(plugin).toContain('<device-transfer>');
    expect(plugin).toContain('<exclude domain="file" path="."/>');
    expect(plugin).toContain('<exclude domain="sharedpref" path="."/>');
  });

  test('auth and private data are routed away from the default plaintext MMKV instance', () => {
    expect(read('apps/mobile/src/lib/supabase.ts')).toContain(
      'createMmkvSessionStorage(authStorage)',
    );
    expect(read('apps/mobile/src/lib/onboarding.ts')).toContain(
      'createMmkvOnboardingDraftStore(privateStorage)',
    );
    expect(read('apps/mobile/src/lib/messaging.ts')).toContain(
      'createMessagingOutbox(privateStorage, userId)',
    );
    expect(read('apps/mobile/src/lib/attendance.ts')).toContain(
      'createAttendanceOutbox(privateStorage, userId)',
    );
    expect(read('apps/mobile/src/components/attendance/attendance-sync-worker.tsx')).toContain(
      'createAttendanceOutbox(privateStorage, userId)',
    );
    expect(read('apps/mobile/src/lib/query-client.ts')).toContain(
      'createQueryPersister(privateStorage)',
    );
    expect(read('apps/mobile/src/lib/storage.ts')).toContain("deleteMMKV('mmkv.default')");
  });

  test('the dev runtime can deliberately prove session refresh persistence', () => {
    const environment = read('apps/mobile/src/components/dev/dev-environment-section.tsx');
    expect(environment).toContain('supabase.auth.refreshSession()');
    expect(environment).toContain('Refresh session');
  });
});
