/**
 * A form she still has to answer (RAPP-700), as a raised row (RAPP-827): its
 * mark, its name, its date when it has one. The row opens the form.
 *
 * In Per fer (RAPP-790) an optional form also has "Ara no", which puts it off:
 * it leaves Per fer and waits in her later list (RAPP-833). In that list the
 * same row has "Esborra" instead, which closes the form for good after she
 * confirms. A legal form has neither (RAPP-771).
 */

import { ToDoRow } from '@/components/home/to-do-row';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useDismissCustomForm, usePutOffCustomForm } from '@/lib/custom-forms';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Text, View } from 'react-native';
import { DEFAULT_LANGUAGE, useLanguage } from '@ramassa/shared/i18n';
import { textIn, type PendingCustomForm } from '@ramassa/shared/intake-builder';

interface PendingFormPromptProps {
  readonly form: PendingCustomForm;
  /** Where the row shows: Per fer on Inici, or her later list. */
  readonly place?: 'toDo' | 'later';
}

export function PendingFormPrompt({ form, place = 'toDo' }: PendingFormPromptProps) {
  const { t, i18n } = useTranslation('home');
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const putOff = usePutOffCustomForm();
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
  const run = useCallback(
    (change: (responseId: string) => Promise<boolean>) => {
      setIsBusy(true);
      void change(form.responseId).finally(() => setIsBusy(false));
    },
    [form.responseId],
  );
  // Deleting closes the form for good, so she is told what it means first.
  const confirmDelete = useCallback(() => {
    Alert.alert(t('later.deleteTitle'), t('later.deleteBody'), [
      { text: t('later.cancel'), style: 'cancel' },
      {
        text: t('later.delete'),
        style: 'destructive',
        onPress: () => {
          playHaptic('warning');
          run(dismiss);
        },
      },
    ]);
  }, [dismiss, run, t]);
  const name = textIn(form.name, language);
  const isLater = place === 'later';
  const secondLabel = isLater ? t('later.delete') : t('pendingForm.dismiss');
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
        markLabel={isLater ? undefined : t('unseen')}
        languageFontClass={languageFontClass}
        onOpen={open}
      />
      {/* A legal form is never put off or deleted (RAPP-771). */}
      {form.mandatory === 'optional' && form.kind !== 'legal' ? (
        <PressableScale
          testID={isLater ? 'pending-form-delete' : 'pending-form-dismiss'}
          accessibilityLabel={`${secondLabel}: ${name}`}
          isDisabled={isBusy}
          onPress={isLater ? confirmDelete : () => run(putOff)}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-min items-center justify-center self-start rounded-md px-sm"
        >
          <Text
            className={`text-md font-bold ${isLater ? 'text-error' : 'text-primary'} ${languageFontClass}`}
          >
            {secondLabel}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}
