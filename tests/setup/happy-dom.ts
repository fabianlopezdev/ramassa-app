// Registers a happy-dom global DOM so React Testing Library tests (apps/admin)
// can run under `bun test` from the repo root. Harmless for pure unit tests.
// The explicit localhost URL gives the DOM a real origin; without one,
// about:blank silently refuses document.cookie writes (RAPP-76).
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'bun:test';
import type { i18n } from 'i18next';
import { setI18n } from 'react-i18next';

GlobalRegistrator.register({ url: 'http://localhost/' });

// One global unmount-after-each for every RTL test file (RAPP-13). React
// Testing Library registers its own auto-cleanup only in the first test file
// that imports it (bun caches the module), so sibling files would otherwise
// leak rendered nodes into this shared document and collide on queries. A
// preload hook applies to all files uniformly; cleanup on an empty DOM is a
// no-op, so it is harmless for pure-logic tests.
afterEach(cleanup);

// Every `createI18n` call registers its instance as react-i18next's global
// fallback, so a component rendered without a provider would otherwise use
// whichever language the previous test file left behind (RAPP-222). Clearing
// it after each test gives every file the same starting point: no instance,
// so an unwrapped component shows its keys until a test provides one.
afterEach(() => {
  setI18n(undefined as unknown as i18n);
});
