/**
 * The form-level error banner for the admin auth screens (RAPP-13): the
 * friendly translated message for an `AUTH-*` code plus the short stable code,
 * announced assertively because it reports a failed action.
 */

import { useTranslation } from 'react-i18next';
import { getErrorMessageKey, type AppErrorCode } from '@ramassa/shared/errors';

export function AuthFormError({ code }: { code: AppErrorCode | null }) {
  const { t } = useTranslation('errors');

  if (!code) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col gap-1 rounded-md bg-destructive/10 p-4 text-start"
    >
      <p className="text-sm font-medium text-destructive">{t(getErrorMessageKey(code))}</p>
      <p className="text-muted-foreground text-xs">
        {t('errorCodeLabel')}: {code}
      </p>
    </div>
  );
}
