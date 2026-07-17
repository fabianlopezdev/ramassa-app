// Registers a happy-dom global DOM so React Testing Library tests (apps/admin)
// can run under `bun test` from the repo root. Harmless for pure unit tests.
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
