/**
 * Her first pending form on Home (RAPP-700), the first card she sees, in the
 * survey prompt's pattern: what it is, its name, its date when it has one,
 * and Respon. An optional form also has "Ara no", which takes it off her Home.
 */

import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useDismissCustomForm, useMyCustomForms } from '@/lib/custom-forms';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { DEFAULT_LANGUAGE, useLanguage } from '@ramassa/shared/i18n';
import { textIn } from '@ramassa/shared/intake-builder';

export function PendingFormPrompt() {
  const { t, i18n } = useTranslation('home');
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { data } = useMyCustomForms(true);
  const dismiss = useDismissCustomForm();
  const [isBusy, setIsBusy] = useState(false);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        day: 'numeric',
        month: 'long',
      }),
    [i18n.resolvedLanguage],
  );
  const form = data?.[0];
  if (form === undefined) return null;
  const name = textIn(form.name, language);
  return (
    <View
      testID="pending-form-prompt"
      className="gap-md rounded-lg border border-primary/20 bg-primary/5 p-lg"
      style={continuousCorners}
    >
      <Text className={`text-start text-sm font-bold uppercase text-primary ${languageFontClass}`}>
        {t('pendingForm.eyebrow')}
      </Text>
      <Text className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}>
        {name}
      </Text>
      {form.deadline === null ? null : (
        <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>
          {t('pendingForm.deadline', {
            date: dateFormatter.format(new Date(`${form.deadline}T12:00:00`)),
          })}
        </Text>
      )}
      <PressableScale
        testID="pending-form-answer"
        accessibilityLabel={`${t('pendingForm.answer')}: ${name}`}
        onPress={() => push(`/form/${form.responseId}` as Href)}
        haptic="tapLight"
        style={continuousCorners}
        className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
      >
        <Text className={`text-md font-bold text-white ${languageFontClass}`}>
          {t('pendingForm.answer')}
        </Text>
      </PressableScale>
      {form.mandatory === 'optional' ? (
        <PressableScale
          testID="pending-form-dismiss"
          accessibilityLabel={t('pendingForm.dismiss')}
          isDisabled={isBusy}
          onPress={() => {
            setIsBusy(true);
            void dismiss(form.responseId).finally(() => setIsBusy(false));
          }}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md px-lg"
        >
          <Text className={`text-md font-bold text-primary ${languageFontClass}`}>
            {t('pendingForm.dismiss')}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}
