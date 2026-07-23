/**
 * Shown when a signed-in identity has no place in the admin (a player, or a
 * role that resolved to no landing). Redirecting them would loop, so this is a
 * terminal state: the translated `AUTH-3` message with its stable code, and a
 * way out (sign out) rather than a bounce.
 */

import { AuthFormError } from '@/components/auth/auth-form-error';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/auth';
import { useTranslation } from 'react-i18next';

export function NoAdminAccess() {
  const { t } = useTranslation('auth');
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <div className="w-full max-w-sm">
        <AuthFormError code="AUTH-3" />
      </div>
      <Button variant="outline" onClick={() => void logout()}>
        {t('signOutAction')}
      </Button>
    </main>
  );
}
