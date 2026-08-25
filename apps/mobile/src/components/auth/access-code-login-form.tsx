import { loginWithAccessCode } from '@/lib/auth';
import { useAuthFlowStatus } from '@/lib/auth-flow-status';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { ACCESS_CODE_CANONICAL_LENGTH, formatAccessCodeInput } from '@ramassa/shared/auth';
import { accessCodeLoginSchema, type AccessCodeLogin } from '@ramassa/shared/schemas';
import { AuthSubmitButton } from './auth-submit-button';
import { AuthTextField } from './auth-text-field';

export function AccessCodeLoginForm() {
  const { t } = useTranslation('auth');
  const { setErrorCode } = useAuthFlowStatus();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AccessCodeLogin>({
    resolver: zodResolver(accessCodeLoginSchema),
    defaultValues: { accessCode: '' },
  });

  const submit = handleSubmit(async ({ accessCode }) => {
    setErrorCode(null);
    const result = await loginWithAccessCode(accessCode);
    if (!result.ok) setErrorCode(result.error.code);
  });

  return (
    <View className="gap-md">
      <Controller
        control={control}
        name="accessCode"
        render={({ field }) => (
          <AuthTextField
            label={t('accessCodeLabel')}
            placeholder={t('accessCodePlaceholder')}
            value={field.value}
            onChangeText={(value) => field.onChange(formatAccessCodeInput(value))}
            onBlur={field.onBlur}
            errorMessage={errors.accessCode ? t('accessCodeInvalid') : undefined}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            inputMode="text"
            maxLength={ACCESS_CODE_CANONICAL_LENGTH}
            returnKeyType="go"
            onSubmitEditing={submit}
            style={{ direction: 'ltr', textAlign: 'left' }}
          />
        )}
      />
      <AuthSubmitButton label={t('accessCodeAction')} onPress={submit} isLoading={isSubmitting} />
    </View>
  );
}
