/** Email OTP request and verification forms for the admin login screen. */

import { Button } from '@/components/ui/button';
import { confirmEmailOtp, sendEmailOtp } from '@/lib/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { AppErrorCode } from '@ramassa/shared/errors';
import {
  emailOtpRequestSchema,
  emailOtpVerifySchema,
  type EmailOtpRequest,
  type EmailOtpVerify,
} from '@ramassa/shared/schemas';
import { AdminAuthField } from './admin-auth-field';
import { AuthFormError } from './auth-form-error';

export function EmailOtpRequestForm({ onSent }: { onSent: (email: string) => void }) {
  const { t } = useTranslation('auth');
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailOtpRequest>({
    resolver: zodResolver(emailOtpRequestSchema),
    defaultValues: { email: '' },
  });

  const submit = handleSubmit(async ({ email }) => {
    setErrorCode(null);
    const result = await sendEmailOtp(email);
    if (result.ok) onSent(email);
    else setErrorCode(result.error.code);
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <AuthFormError code={errorCode} />
      <AdminAuthField
        id="otp-email"
        label={t('emailLabel')}
        type="email"
        autoComplete="email"
        placeholder={t('emailPlaceholder')}
        errorMessage={errors.email ? t('emailInvalid') : undefined}
        {...register('email')}
      />
      <Button type="submit" className="h-11 w-full text-base" disabled={isSubmitting}>
        {t('emailOtpAction')}
      </Button>
    </form>
  );
}

export function EmailOtpVerifyForm({ email }: { email: string }) {
  const { t } = useTranslation('auth');
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailOtpVerify>({
    resolver: zodResolver(emailOtpVerifySchema),
    defaultValues: { email, token: '' },
  });

  const submit = handleSubmit(async ({ token }) => {
    setErrorCode(null);
    const result = await confirmEmailOtp(email, token);
    if (!result.ok) setErrorCode(result.error.code);
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <AuthFormError code={errorCode} />
      <AdminAuthField
        id="otp-code"
        label={t('emailOtpCodeLabel')}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder={t('emailOtpCodePlaceholder')}
        errorMessage={errors.token ? t('emailOtpCodeInvalid') : undefined}
        {...register('token')}
      />
      <Button type="submit" className="h-11 w-full text-base" disabled={isSubmitting}>
        {t('emailOtpVerifyAction')}
      </Button>
    </form>
  );
}
