/**
 * The primary login path (ADR-005): the player types their email and we send a
 * one-time link. Validation is the shared zod schema (client-side for UX); a
 * failed send reports the mapped `AUTH-*` code to the shared auth-flow status,
 * which the login screen renders as one banner. On success the screen swaps to
 * the "check your email" confirmation.
 */

import { sendMagicLink } from '@/lib/auth';
import { useAuthFlowStatus } from '@/lib/auth-flow-status';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { magicLinkRequestSchema, type MagicLinkRequest } from '@ramassa/shared/schemas';
import { AuthSubmitButton } from './auth-submit-button';
import { AuthTextField } from './auth-text-field';

export function MagicLinkForm({ onSent }: { onSent: (email: string) => void }) {
  const { t } = useTranslation('auth');
  const { setErrorCode } = useAuthFlowStatus();
  const {
    control,
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
      <AuthSubmitButton label={t('magicLinkAction')} onPress={submit} isLoading={isSubmitting} />
    </View>
  );
}
