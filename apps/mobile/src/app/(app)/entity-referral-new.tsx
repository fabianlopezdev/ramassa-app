/**
 * A new referral from the phone (RAPP-413), as the web portal's referral form:
 * first and last name, an optional phone and email, the documentation status
 * and optional notes, only what the team needs for the first contact. A field
 * the form refuses says why until it changes; once sent, the referral opens.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useReferralActions } from '@/lib/entity-referrals';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createReferralSchema,
  DOCUMENTATION_STATUSES,
  type CreateReferralInput,
} from '@ramassa/shared/referrals';

type Field = 'firstName' | 'lastName' | 'email';

export default function EntityReferralNewScreen() {
  const { t } = useTranslation('referrals');
  const fontClass = useLanguageFontClass();
  const { back, replace } = useRouter();
  const { create } = useReferralActions();
  const [form, setForm] = useState<CreateReferralInput>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    documentationStatus: 'none',
    notes: '',
  });
  const [invalid, setInvalid] = useState<ReadonlySet<Field>>(new Set());
  const [hasFailed, setHasFailed] = useState(false);
  const set = (patch: Partial<CreateReferralInput>) => {
    setHasFailed(false);
    setInvalid((current) => {
      const next = new Set(current);
      for (const field of Object.keys(patch)) next.delete(field as Field);
      return next.size === current.size ? current : next;
    });
    setForm((current) => ({ ...current, ...patch }));
  };

  const submit = () => {
    const parsed = createReferralSchema.safeParse(form);
    if (!parsed.success) {
      setInvalid(
        new Set(
          parsed.error.issues
            .map((issue) => issue.path[0])
            .filter(
              (path): path is Field =>
                path === 'firstName' || path === 'lastName' || path === 'email',
            ),
        ),
      );
      playHaptic('warning');
      return;
    }
    setInvalid(new Set());
    create.mutate(parsed.data, {
      onSuccess: (referralId) => {
        playHaptic('success');
        replace(`/entity-referral/${referralId}` as Href);
      },
      onError: () => {
        playHaptic('error');
        setHasFailed(true);
      },
    });
  };

  const errorFor = (field: Field) =>
    invalid.has(field) ? (field === 'email' ? t('emailError') : t('requiredError')) : undefined;

  return (
    <SafeAreaView
      testID="entity-referral-form"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-3xl"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="entity-referral-form-back"
            accessibilityLabel={t('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>{t('back')}</Text>
          </PressableScale>
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('formTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('formIntro')}
            </Text>
          </View>
          <AuthTextField
            testID="entity-referral-first-name"
            label={t('firstName')}
            value={form.firstName}
            onChangeText={(firstName) => set({ firstName })}
            errorMessage={errorFor('firstName')}
            maxLength={100}
          />
          <AuthTextField
            testID="entity-referral-last-name"
            label={t('lastName')}
            value={form.lastName}
            onChangeText={(lastName) => set({ lastName })}
            errorMessage={errorFor('lastName')}
            maxLength={100}
          />
          <AuthTextField
            testID="entity-referral-phone"
            label={t('phone')}
            value={form.phone ?? ''}
            onChangeText={(phone) => set({ phone })}
            keyboardType="phone-pad"
            maxLength={50}
          />
          <AuthTextField
            testID="entity-referral-email"
            label={t('email')}
            value={form.email ?? ''}
            onChangeText={(email) => set({ email })}
            errorMessage={errorFor('email')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={254}
          />
          <View className="gap-sm">
            <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
              {t('documentationLabel')}
            </Text>
            <View className="flex-row flex-wrap gap-sm">
              {DOCUMENTATION_STATUSES.map((status) => (
                <ChoiceOption
                  key={status}
                  testID={`entity-referral-documentation-${status}`}
                  value={status}
                  label={t(`documentation.${status}`)}
                  selected={status === form.documentationStatus}
                  onSelect={(documentationStatus) => set({ documentationStatus })}
                  languageFontClass={fontClass}
                />
              ))}
            </View>
          </View>
          <AuthTextField
            testID="entity-referral-notes"
            label={t('notes')}
            value={form.notes ?? ''}
            onChangeText={(notes) => set({ notes })}
            multiline
            maxLength={4000}
          />
          {hasFailed ? (
            <Text
              accessibilityLiveRegion="polite"
              className={`text-start text-md text-error ${fontClass}`}
            >
              {t('saveError')}
            </Text>
          ) : null}
          <PressableScale
            testID="entity-referral-save"
            accessibilityRole="button"
            accessibilityLabel={t('save')}
            onPress={submit}
            isBusy={create.isPending}
            isDisabled={create.isPending}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
          >
            <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
              {t('save')}
            </Text>
          </PressableScale>
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
