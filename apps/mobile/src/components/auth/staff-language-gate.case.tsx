import { act, render } from '@testing-library/react';
import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { createElement } from 'react';

let language = 'ar';
let isRtl = true;
const setLanguage = mock(async (next: string) => {
  language = next;
});
const reloadAppAsync = mock(async () => undefined);
mock.module('expo', () => ({ reloadAppAsync }));
mock.module('react-native', () => ({
  I18nManager: {
    get isRTL() {
      return isRtl;
    },
  },
}));
mock.module('@ramassa/shared/i18n', () => ({
  staffLanguageFor: (code: string) => (['ca', 'es', 'en'].includes(code) ? code : 'ca'),
  useLanguage: () => ({ language, setLanguage }),
  getLanguageDirection: (code: string) => (code === 'ar' || code === 'fa' ? 'rtl' : 'ltr'),
}));

const { StaffLanguageGate } = await import('./staff-language-gate');

beforeEach(() => {
  setLanguage.mockClear();
  reloadAppAsync.mockClear();
  isRtl = true;
});
afterAll(() => mock.restore());

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

test('a team member in Arabic gets Catalan, with a restart to flip the layout', async () => {
  language = 'ar';
  const view = render(createElement(StaffLanguageGate, { isStaffSide: true }));
  await settle();
  expect(setLanguage).toHaveBeenCalledWith('ca');
  expect(reloadAppAsync).toHaveBeenCalledTimes(1);
  view.unmount();
});

test('Spanish stays Spanish, and nothing restarts', async () => {
  language = 'es';
  isRtl = false;
  const view = render(createElement(StaffLanguageGate, { isStaffSide: true }));
  await settle();
  expect(setLanguage).not.toHaveBeenCalled();
  expect(reloadAppAsync).not.toHaveBeenCalled();
  view.unmount();
});

test('a player keeps Arabic', async () => {
  language = 'ar';
  const view = render(createElement(StaffLanguageGate, { isStaffSide: false }));
  await settle();
  expect(setLanguage).not.toHaveBeenCalled();
  view.unmount();
});
