/**
 * A calendar date (RAPP-344), for a service category's date fields: one
 * button with the native date picker, over an ISO date (`YYYY-MM-DD`) in the
 * phone's own calendar. Empty means no date. The web build has its own file
 * (`date-field.web.tsx`), because the native picker draws nothing there.
 */
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';
import { fromIsoDate, toIsoDate } from './date-time-value';

export interface DateFieldProps {
  readonly testID: string;
  readonly label: string;
  /** `YYYY-MM-DD`, or empty for no date. */
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export function DateField({ testID, label, value, onChange }: DateFieldProps) {
  const { t, i18n } = useTranslation(['mentoring', 'announcements']);
  const fontClass = useLanguageFontClass();
  const language = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(() => fromIsoDate(value) ?? new Date());
  const format = useMemo(
    () => new Intl.DateTimeFormat(language, { dateStyle: 'medium' }),
    [language],
  );
  const current = fromIsoDate(value);

  const handleChange = (_event: unknown, picked: Date) => {
    setDraft(picked);
    if (Platform.OS === 'android') {
      onChange(toIsoDate(picked));
      setIsOpen(false);
    }
  };

  return (
    <View className="gap-xs">
      <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
        {label}
      </Text>
      <PressableScale
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current === null ? t('announcements:none') : format.format(current)}`}
        onPress={() => {
          setDraft(fromIsoDate(value) ?? new Date());
          setIsOpen(true);
        }}
        haptic="tapLight"
        style={continuousCorners}
        className="min-h-recommended justify-center rounded-md border border-neutral-300 bg-white px-md"
      >
        <Text className={`text-start text-md text-neutral-900 ${fontClass}`}>
          {current === null ? t('announcements:none') : format.format(current)}
        </Text>
      </PressableScale>
      {current === null ? null : (
        <PressableScale
          testID={`${testID}-clear`}
          accessibilityRole="button"
          accessibilityLabel={t('announcements:clearDate')}
          onPress={() => onChange('')}
          haptic="tapLight"
          className="min-h-recommended justify-center self-start"
        >
          <Text className={`font-semibold text-primary-dark ${fontClass}`}>
            {t('announcements:clearDate')}
          </Text>
        </PressableScale>
      )}
      {isOpen ? (
        <View className="gap-sm">
          <DateTimePicker
            testID={`${testID}-picker`}
            value={draft}
            mode="date"
            display="inline"
            presentation="dialog"
            locale={language}
            accentColor={tokens.colors.primary.DEFAULT}
            onValueChange={handleChange}
            onDismiss={() => setIsOpen(false)}
            positiveButton={{ label: t('mentoring:pickerDone') }}
            negativeButton={{ label: t('mentoring:pickerCancel') }}
          />
          {Platform.OS === 'ios' ? (
            <View className="flex-row flex-wrap justify-end gap-sm">
              <PressableScale
                accessibilityLabel={t('mentoring:pickerCancel')}
                onPress={() => setIsOpen(false)}
                className="min-h-recommended items-center justify-center rounded-md px-md"
              >
                <Text className={`text-md font-bold text-neutral-700 ${fontClass}`}>
                  {t('mentoring:pickerCancel')}
                </Text>
              </PressableScale>
              <PressableScale
                testID={`${testID}-done`}
                accessibilityLabel={t('mentoring:pickerDone')}
                onPress={() => {
                  onChange(toIsoDate(draft));
                  setIsOpen(false);
                }}
                className="min-h-recommended items-center justify-center rounded-md bg-primary px-md"
              >
                <Text className={`text-md font-bold text-white ${fontClass}`}>
                  {t('mentoring:pickerDone')}
                </Text>
              </PressableScale>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
