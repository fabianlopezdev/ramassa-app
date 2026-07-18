/**
 * The fallback login path (ADR-005): players without a personal email get an
 * admin-created account (internal email + password) and sign in here. Same
 * shared zod schema and mapped-error reporting as the magic-link form; a bare
 * failure is reported as invalid credentials (AUTH-6). On success the auth
 * state change redirects into the app, so this form has no success branch.
 */

import { loginWithPassword } from '@/lib/auth';
import { useAuthFlowStatus } from '@/lib/auth-flow-status';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { PASSWORD_MIN_LENGTH } from '@ramassa/shared/constants';
import { passwordLoginSchema, type PasswordLogin } from '@ramassa/shared/schemas';
import { AuthSubmitButton } from './auth-submit-button';
import { AuthTextField } from './auth-text-field';

export function PasswordLoginForm() {
  const { t } = useTranslation('auth');
  const { setErrorCode } = useAuthFlowStatus();
  const {
    control,
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
            returnKeyType="next"
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <AuthTextField
            label={t('passwordLabel')}
            placeholder={t('passwordPlaceholder')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            errorMessage={
              errors.password ? t('passwordTooShort', { count: PASSWORD_MIN_LENGTH }) : undefined
            }
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        )}
      />
      <AuthSubmitButton label={t('passwordAction')} onPress={submit} isLoading={isSubmitting} />
    </View>
  );
}
