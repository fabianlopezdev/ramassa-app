/**
 * Admin magic-link login (ADR-005, primary path): staff and entity users type
 * their email and receive a one-time link. Shared zod validation, mapped
 * `AUTH-*` errors, and a "check your email" success handoff to the login page.
 */

import { Button } from '@/components/ui/button';
import { sendMagicLink } from '@/lib/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { AppErrorCode } from '@ramassa/shared/errors';
import { magicLinkRequestSchema, type MagicLinkRequest } from '@ramassa/shared/schemas';
import { AdminAuthField } from './admin-auth-field';
import { AuthFormError } from './auth-form-error';

export function MagicLinkForm({ onSent }: { onSent: (email: string) => void }) {
  const { t } = useTranslation('auth');
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MagicLinkRequest>({
    resolver: zodResolver(magicLinkRequestSchema),
    defaultValues: { email: '' },
  });

  const submit = handleSubmit(async ({ email }) => {
    setErrorCode(null);
    const result = await sendMagicLink(email);
    if (result.ok) {
      onSent(email);
    } else {
      setErrorCode(result.error.code);
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <AuthFormError code={errorCode} />
      <AdminAuthField
        id="magic-email"
        label={t('emailLabel')}
        type="email"
        autoComplete="email"
        placeholder={t('emailPlaceholder')}
        errorMessage={errors.email ? t('emailInvalid') : undefined}
        {...register('email')}
      />
      <Button type="submit" className="h-11 w-full text-base" disabled={isSubmitting}>
        {t('magicLinkAction')}
      </Button>
    </form>
  );
}
