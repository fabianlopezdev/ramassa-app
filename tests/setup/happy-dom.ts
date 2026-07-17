// Registers a happy-dom global DOM so React Testing Library tests (apps/admin)
// can run under `bun test` from the repo root. Harmless for pure unit tests.
// The explicit localhost URL gives the DOM a real origin; without one,
// about:blank silently refuses document.cookie writes (RAPP-76).
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://localhost/' });
