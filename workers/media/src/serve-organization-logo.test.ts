import { expect, mock, test } from 'bun:test';
import { handleServeOrganizationLogo } from './serve-organization-logo';

const key =
  '12400000-0000-4000-8000-000000000001/organization-branding/12400000-0000-4000-8000-000000000002/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png';
function dependencies(logo: string | null = key) {
  return {
    resolveLogo: mock(async () => logo),
    bucket: {
      get: mock(async () => ({
        body: new Blob(['logo']).stream(),
        size: 4,
        httpEtag: '"logo"',
        writeHttpMetadata: (headers: Headers) => headers.set('Content-Type', 'image/png'),
      })),
    },
  };
}
test('serves only the registered organization logo without authentication', async () => {
  const deps = dependencies();
  const response = await handleServeOrganizationLogo(
    new Request('https://media.test/branding/ramassa/logo'),
    deps,
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('logo');
  expect(deps.resolveLogo).toHaveBeenCalledWith('ramassa');
  expect(deps.bucket.get).toHaveBeenCalledWith(key);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});
test('unknown organizations and absent logos disclose no object', async () => {
  const deps = dependencies(null);
  expect(
    (
      await handleServeOrganizationLogo(
        new Request('https://media.test/branding/unknown/logo'),
        deps,
      )
    ).status,
  ).toBe(404);
  expect(deps.bucket.get).not.toHaveBeenCalled();
});
test('private folders, remote URLs and malformed keys cannot be published as logos', async () => {
  for (const value of [
    key.replace('organization-branding', 'documents'),
    'https://private.test/image.png',
    '../secret.png',
  ]) {
    const deps = dependencies(value);
    expect(
      (
        await handleServeOrganizationLogo(
          new Request('https://media.test/branding/ramassa/logo'),
          deps,
        )
      ).status,
    ).toBe(404);
    expect(deps.bucket.get).not.toHaveBeenCalled();
  }
});
test('rejects extra paths and writes before looking up an organization', async () => {
  for (const request of [
    new Request('https://media.test/branding/ramassa/logo/secret'),
    new Request('https://media.test/branding/ramassa/logo', { method: 'POST' }),
  ]) {
    const deps = dependencies();
    expect((await handleServeOrganizationLogo(request, deps)).status).toBeGreaterThanOrEqual(400);
    expect(deps.resolveLogo).not.toHaveBeenCalled();
  }
});
test('lookup failures return a controlled error', async () => {
  const deps = dependencies();
  deps.resolveLogo.mockImplementation(async () => {
    throw new Error('offline');
  });
  expect(
    (
      await handleServeOrganizationLogo(
        new Request('https://media.test/branding/ramassa/logo'),
        deps,
      )
    ).status,
  ).toBeGreaterThanOrEqual(500);
  expect(deps.bucket.get).not.toHaveBeenCalled();
});
