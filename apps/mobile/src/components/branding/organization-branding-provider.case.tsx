import { act, render, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

let session: { user: { id: string } } | null = null;
let onAppStateChange: (state: string) => void = () => undefined;
const removeListener = mock(() => undefined);
const rpc = mock(() =>
  Promise.resolve({
    data: [{ primary_color: '#663399', secondary_color: '#FFE08A' }],
    error: null,
  }),
);
const single = mock(() =>
  Promise.resolve({
    data: {
      id: '64000000-0000-4000-8000-000000000001',
      name: 'Test club',
      slug: 'test-club',
      logo_url: null,
      primary_color: '#005A8C',
      secondary_color: '#FFD166',
      default_language: 'ca',
      available_languages: ['ca'],
      locked_default_language: null,
      contact_email: null,
      contact_phone: null,
    },
    error: null,
  }),
);
const from = mock(() => ({ select: () => ({ single }) }));
const changeLanguage = mock(async () => undefined);

mock.module('@/lib/supabase', () => ({ supabase: { rpc, from } }));
mock.module('@/lib/i18n', () => ({ i18n: { resolvedLanguage: 'en', changeLanguage } }));
mock.module('@ramassa/shared/auth', () => ({ useAuth: () => ({ session }) }));
mock.module('nativewind', () => ({ vars: (value: unknown) => value }));
mock.module('react-native', () => ({
  AppState: {
    addEventListener: (_event: string, listener: typeof onAppStateChange) => {
      onAppStateChange = listener;
      return { remove: removeListener };
    },
  },
  View: ({ children, style }: { children: ReactNode; style: unknown }) =>
    createElement('div', { 'data-testid': 'theme', 'data-theme': JSON.stringify(style) }, children),
}));

const { OrganizationBrandingProvider, useOrganizationBranding } =
  await import('./organization-branding-provider');

function Content() {
  const organization = useOrganizationBranding();
  return createElement('span', null, organization?.name ?? 'Choose your language');
}

const app = () => createElement(OrganizationBrandingProvider, null, createElement(Content));
beforeEach(() => {
  session = null;
  rpc.mockReset();
  rpc.mockResolvedValue({
    data: [{ primary_color: '#663399', secondary_color: '#FFE08A' }],
    error: null,
  });
  from.mockClear();
  changeLanguage.mockClear();
  removeListener.mockClear();
});
afterAll(() => mock.restore());

test('loads dashboard colors before login without reading private settings or changing language', async () => {
  const view = render(app());
  expect(view.getByText('Choose your language')).toBeTruthy();
  await waitFor(() => expect(view.getByTestId('theme').dataset.theme).toContain('102 51 153'));
  expect(rpc).toHaveBeenCalledWith('get_public_organization_branding', {
    organization_slug: 'ramassa',
  });
  expect(from).not.toHaveBeenCalled();
  expect(changeLanguage).not.toHaveBeenCalled();
});

test('offline first launch keeps default colors and the screen usable', async () => {
  rpc.mockRejectedValueOnce(new Error('offline'));
  const view = render(app());
  await act(async () => undefined);
  expect(view.getByText('Choose your language')).toBeTruthy();
  expect(view.getByTestId('theme').dataset.theme).toContain('0 119 182');
});

test('malformed public colors fall back instead of crashing', async () => {
  rpc.mockResolvedValueOnce({
    data: [{ primary_color: 'invalid', secondary_color: '#FFD166' }],
    error: null,
  });
  const view = render(app());
  await act(async () => undefined);
  expect(view.getByTestId('theme').dataset.theme).toContain('0 119 182');
});

test('an unknown organization keeps default colors', async () => {
  rpc.mockResolvedValueOnce({ data: [], error: null });
  const view = render(app());
  await act(async () => undefined);
  expect(view.getByText('Choose your language')).toBeTruthy();
  expect(view.getByTestId('theme').dataset.theme).toContain('0 119 182');
});

test('foreground refresh loads new colors and a failed refresh keeps the last valid colors', async () => {
  const view = render(app());
  await waitFor(() => expect(view.getByTestId('theme').dataset.theme).toContain('102 51 153'));
  rpc.mockResolvedValueOnce({
    data: [{ primary_color: '#005A8C', secondary_color: '#FFD166' }],
    error: null,
  });
  await act(async () => onAppStateChange('active'));
  expect(view.getByTestId('theme').dataset.theme).toContain('0 90 140');
  rpc.mockRejectedValueOnce(new Error('offline'));
  await act(async () => onAppStateChange('active'));
  expect(view.getByTestId('theme').dataset.theme).toContain('0 90 140');
  view.unmount();
  expect(removeListener).toHaveBeenCalled();
});

test('authenticated settings win and logout returns to public colors', async () => {
  session = { user: { id: 'player' } };
  const view = render(app());
  await waitFor(() => expect(view.getByText('Test club')).toBeTruthy());
  expect(view.getByTestId('theme').dataset.theme).toContain('0 90 140');
  expect(changeLanguage).toHaveBeenCalledWith('ca');
  session = null;
  view.rerender(app());
  await waitFor(() => expect(view.getByTestId('theme').dataset.theme).toContain('102 51 153'));
  expect(view.getByText('Choose your language')).toBeTruthy();
});

test('an older public response cannot overwrite a newer foreground refresh', async () => {
  let finishOlder!: (value: Awaited<ReturnType<typeof rpc>>) => void;
  rpc.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOlder = resolve;
      }),
  );
  const view = render(app());
  await act(async () => onAppStateChange('active'));
  expect(view.getByTestId('theme').dataset.theme).toContain('102 51 153');
  await act(async () =>
    finishOlder({ data: [{ primary_color: '#005A8C', secondary_color: '#FFD166' }], error: null }),
  );
  expect(view.getByTestId('theme').dataset.theme).toContain('102 51 153');
});
