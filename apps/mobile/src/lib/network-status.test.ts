import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'bun:test';
import { isNetworkStateOnline } from './network-status';

const mobileRoot = fileURLToPath(new URL('../', import.meta.url));

test('only an explicit disconnected or unreachable state is offline', () => {
  expect(isNetworkStateOnline({})).toBe(true);
  expect(isNetworkStateOnline({ isConnected: true, isInternetReachable: undefined })).toBe(true);
  expect(isNetworkStateOnline({ isConnected: false, isInternetReachable: true })).toBe(false);
  expect(isNetworkStateOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
});

test('native network subscription starts after the root has mounted', async () => {
  const queryClient = await readFile(`${mobileRoot}lib/query-client.ts`, 'utf8');
  const rootLayout = await readFile(`${mobileRoot}app/_layout.tsx`, 'utf8');

  expect(queryClient).not.toContain('configureNetworkStatus();');
  expect(rootLayout).toContain('useEffect(() => {\n    configureNetworkStatus();\n  }, []);');
});
