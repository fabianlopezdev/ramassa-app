// Sentry first: the SDK must be initialized before hydration so render-time
// failures during boot are already captured (RAPP-12).
import './instrument.client';
import { StartClient } from '@tanstack/react-start/client';
import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
);
