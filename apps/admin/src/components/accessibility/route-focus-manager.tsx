import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

export function RouteFocusManager({ targetId }: { readonly targetId: string }) {
  const router = useRouter();

  useEffect(
    () =>
      router.subscribe('onRendered', () => {
        document.getElementById(targetId)?.focus();
      }),
    [router, targetId],
  );

  return null;
}
