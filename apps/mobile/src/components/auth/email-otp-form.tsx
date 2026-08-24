/** Email OTP request and verification forms for the mobile login screen. */

import { confirmEmailOtp, sendEmailOtp } from '@/lib/auth';
import { useAuthFlowStatus } from '@/lib/auth-flow-status';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  emailOtpRequestSchema,
  emailOtpVerifySchema,
  type EmailOtpRequest,
  type EmailOtpVerify,
} from '@ramassa/shared/schemas';
import { AuthSubmitButton } from './auth-submit-button';
import { AuthTextField } from './auth-text-field';

export function EmailOtpRequestForm({ onSent }: { onSent: (email: string) => void }) {
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
    if (result.ok) onSent(email);
    else setErrorCode(result.error.code);
  });

  return (
    <View className="gap-md">
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
          />
        )}
      />
      <AuthSubmitButton label={t('emailOtpAction')} onPress={submit} isLoading={isSubmitting} />
    </View>
  );
}

export function EmailOtpVerifyForm({ email }: { email: string }) {
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
    if (!result.ok) setErrorCode(result.error.code);
  });

  return (
    <View className="gap-md">
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
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        )}
      />
      <AuthSubmitButton
        label={t('emailOtpVerifyAction')}
        onPress={submit}
        isLoading={isSubmitting}
      />
    </View>
  );
}
