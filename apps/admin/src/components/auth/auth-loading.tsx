/**
 * A full-height loading state for the auth flow (RAPP-13): shown while the
 * persisted session resolves on the client and while the magic-link callback
 * is being processed. Announced politely; the spinner itself is decorative.
 */

import { Loader2 } from 'lucide-react';

export function AuthLoading({ label }: { label: string }) {
  return (
    <main
      role="status"
      aria-live="polite"
      className="flex min-h-svh flex-col items-center justify-center gap-4"
    >
      <Loader2 aria-hidden className="size-8 animate-spin text-primary" />
      <p className="text-muted-foreground text-sm">{label}</p>
    </main>
  );
}
