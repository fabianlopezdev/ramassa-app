/**
 * A pending form on Inici (RAPP-700), shown inside the Per fer block
 * (RAPP-790) as a raised row (RAPP-827): its mark, its name, its date when it
 * has one. The row opens the form. An optional form also has "Ara no", which
 * takes it off her Home; a legal one never does (RAPP-771).
 */

import { ToDoRow } from '@/components/home/to-do-row';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useDismissCustomForm } from '@/lib/custom-forms';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { DEFAULT_LANGUAGE, useLanguage } from '@ramassa/shared/i18n';
import { textIn, type PendingCustomForm } from '@ramassa/shared/intake-builder';

export function PendingFormPrompt({ form }: { readonly form: PendingCustomForm }) {
  const { t, i18n } = useTranslation('home');
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
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
  const open = useCallback(() => push(`/form/${form.responseId}` as Href), [form.responseId, push]);
  const name = textIn(form.name, language);
  return (
    <View testID="pending-form-prompt" className="gap-xs">
      {/* A half-answered form is not saved, so a form has no started state (RAPP-825). */}
      <ToDoRow
        testID="pending-form-answer"
        title={name}
        detail={
          form.deadline === null
            ? undefined
            : t('pendingForm.deadline', {
                date: dateFormatter.format(new Date(`${form.deadline}T12:00:00`)),
              })
        }
        accessibilityLabel={`${t('pendingForm.answer')}: ${name}`}
        markLabel={t('unseen')}
        languageFontClass={languageFontClass}
        onOpen={open}
      />
      {/* A legal form is never put off (RAPP-771). */}
      {form.mandatory === 'optional' && form.kind !== 'legal' ? (
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
          className="min-h-min items-center justify-center self-start rounded-md px-sm"
        >
          <Text className={`text-md font-bold text-primary ${languageFontClass}`}>
            {t('pendingForm.dismiss')}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}
