/** Email OTP request and verification forms for the mobile login screen. */

import { confirmEmailOtp, sendEmailOtp } from '@/lib/auth';
import { useAuthFlowStatus } from '@/lib/auth-flow-status';
import { playHaptic } from '@/lib/haptics/haptics';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  emailOtpRequestSchema,
  emailOtpVerifySchema,
  type EmailOtpRequest,
  type EmailOtpVerify,
} from '@ramassa/shared/schemas';
import type { AuthFormLayout } from './auth-form-layout';
import { AuthSubmitButton } from './auth-submit-button';
import { AuthTextField } from './auth-text-field';

/** Mirrors `emailOtpVerifySchema`, which accepts exactly six digits. */
const EMAIL_OTP_CODE_LENGTH = 6;

// A rejected submit is the player's own input to fix, so it warns. The server
// failures get their haptic from the shake on the form error instead.
const warnInvalidSubmit = () => playHaptic('warning');

export function EmailOtpRequestForm({
  onSent,
  renderLayout,
}: {
  onSent: (email: string) => void;
  renderLayout: AuthFormLayout;
}) {
  const { t } = useTranslation('auth');
  const { setErrorCode } = useAuthFlowStatus();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailOtpRequest>({
    resolver: zodResolver(emailOtpRequestSchema),
    defaultValues: { email: '' },
  });

  const submit = handleSubmit(async ({ email }) => {
    setErrorCode(null);
    const result = await sendEmailOtp(email);
    if (!result.ok) {
      setErrorCode(result.error.code);
      return;
    }
    playHaptic('success');
    onSent(email);
  }, warnInvalidSubmit);

  return renderLayout(
    <Controller
      control={control}
      name="email"
      render={({ field }) => (
        <AuthTextField
          label={t('emailLabel')}
          placeholder={t('emailPlaceholder')}
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          errorMessage={errors.email ? t('emailInvalid') : undefined}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          inputMode="email"
          returnKeyType="send"
          onSubmitEditing={submit}
          aria-busy={isSubmitting}
        />
      )}
    />,
    <AuthSubmitButton label={t('emailOtpAction')} onPress={submit} isLoading={isSubmitting} />,
  );
}

export function EmailOtpVerifyForm({
  email,
  renderLayout,
}: {
  email: string;
  renderLayout: AuthFormLayout;
}) {
  const { t } = useTranslation('auth');
  const { setErrorCode } = useAuthFlowStatus();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailOtpVerify>({
    resolver: zodResolver(emailOtpVerifySchema),
    defaultValues: { email, token: '' },
  });

  const submit = handleSubmit(async ({ token }) => {
    setErrorCode(null);
    const result = await confirmEmailOtp(email, token);
    // On success the session change routes the player into the app.
    if (result.ok) playHaptic('success');
    else setErrorCode(result.error.code);
  }, warnInvalidSubmit);

  return renderLayout(
    <Controller
      control={control}
      name="token"
      render={({ field }) => (
        <AuthTextField
          label={t('emailOtpCodeLabel')}
          placeholder={t('emailOtpCodePlaceholder')}
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          errorMessage={errors.token ? t('emailOtpCodeInvalid') : undefined}
          keyboardType="number-pad"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          inputMode="numeric"
          maxLength={EMAIL_OTP_CODE_LENGTH}
          returnKeyType="done"
          onSubmitEditing={submit}
          aria-busy={isSubmitting}
        />
      )}
    />,
    <AuthSubmitButton
      label={t('emailOtpVerifyAction')}
      onPress={submit}
      isLoading={isSubmitting}
    />,
  );
}
