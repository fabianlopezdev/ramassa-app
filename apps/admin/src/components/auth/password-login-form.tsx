/**
 * Admin password login (ADR-005, fallback path): for accounts created with an
 * internal email + password. Shared zod validation; a bare failure is reported
 * as invalid credentials (AUTH-6). On success the auth-state change flips the
 * route guard, so there is no explicit success branch here.
 */

import { Button } from '@/components/ui/button';
import { loginWithPassword } from '@/lib/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { PASSWORD_MIN_LENGTH } from '@ramassa/shared/constants';
import type { AppErrorCode } from '@ramassa/shared/errors';
import { passwordLoginSchema, type PasswordLogin } from '@ramassa/shared/schemas';
import { AdminAuthField } from './admin-auth-field';
import { AuthFormError } from './auth-form-error';

export function PasswordLoginForm() {
  const { t } = useTranslation('auth');
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordLogin>({
    resolver: zodResolver(passwordLoginSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async ({ email, password }) => {
    setErrorCode(null);
    const result = await loginWithPassword(email, password);
    if (!result.ok) {
      setErrorCode(result.error.code);
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <AuthFormError code={errorCode} />
      <AdminAuthField
        id="password-email"
        label={t('emailLabel')}
        type="email"
        autoComplete="email"
        placeholder={t('emailPlaceholder')}
        errorMessage={errors.email ? t('emailInvalid') : undefined}
        {...register('email')}
      />
      <AdminAuthField
        id="password"
        label={t('passwordLabel')}
        type="password"
        autoComplete="current-password"
        placeholder={t('passwordPlaceholder')}
        errorMessage={
          errors.password ? t('passwordTooShort', { count: PASSWORD_MIN_LENGTH }) : undefined
        }
        {...register('password')}
      />
      <Button type="submit" className="h-11 w-full text-base" disabled={isSubmitting}>
        {t('passwordAction')}
      </Button>
    </form>
  );
}
