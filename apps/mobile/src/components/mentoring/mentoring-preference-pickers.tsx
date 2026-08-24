import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import {
  canonicalDateFromPicker,
  canonicalDateToPicker,
  canonicalTimeFromPicker,
  canonicalTimeToPicker,
  clearPreferredDate,
} from '@/lib/mentoring-preference';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

export interface MentoringPreferencePickersProps {
  readonly preferredDate: string;
  readonly preferredTime: string;
  readonly onPreferredDateChange: (value: string) => void;
  readonly onPreferredTimeChange: (value: string) => void;
}

type PickerMode = 'date' | 'time';

export function MentoringPreferencePickers({
  preferredDate,
  preferredTime,
  onPreferredDateChange,
  onPreferredTimeChange,
}: MentoringPreferencePickersProps) {
  const { t, i18n } = useTranslation(['mentoring', 'common']);
  const languageFontClass = useLanguageFontClass();
  const language = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const [activePicker, setActivePicker] = useState<PickerMode | null>(null);
  const [draftValue, setDraftValue] = useState(() => new Date());
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { dateStyle: 'medium' }),
    [language],
  );
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }),
    [language],
  );
  const displayedDate =
    preferredDate.length === 0
      ? t('mentoring:preferredNoPreference')
      : dateFormatter.format(canonicalDateToPicker(preferredDate, new Date()));
  const displayedTime =
    preferredTime.length === 0
      ? t('mentoring:preferredNoPreference')
      : timeFormatter.format(canonicalTimeToPicker(preferredTime, new Date()));

  const openPicker = (mode: PickerMode) => {
    const now = new Date();
    setDraftValue(
      mode === 'date'
        ? canonicalDateToPicker(preferredDate, now)
        : canonicalTimeToPicker(preferredTime, now),
    );
    setActivePicker(mode);
  };

  const commitValue = (mode: PickerMode, value: Date) => {
    if (mode === 'date') onPreferredDateChange(canonicalDateFromPicker(value));
    else onPreferredTimeChange(canonicalTimeFromPicker(value));
  };

  const handlePickerChange = (_event: unknown, value: Date) => {
    setDraftValue(value);
    if (Platform.OS === 'android' && activePicker !== null) {
      commitValue(activePicker, value);
      setActivePicker(null);
    }
  };

  const confirmInlinePicker = () => {
    if (activePicker !== null) commitValue(activePicker, draftValue);
    setActivePicker(null);
  };

  const clearDate = () => {
    const cleared = clearPreferredDate();
    onPreferredDateChange(cleared.preferredDate);
    onPreferredTimeChange(cleared.preferredTime);
    setActivePicker(null);
  };

  return (
    <View className="gap-md">
      <View className="gap-md sm:flex-row">
        <View className="flex-1 gap-sm">
          <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
            {t('mentoring:preferredDateLabel')}
          </Text>
          <PressableScale
            testID="mentoring-preferred-date"
            accessibilityLabel={`${t('mentoring:preferredDateLabel')}: ${displayedDate}`}
            accessibilityHint={t('mentoring:preferredDateChoose')}
            onPress={() => openPicker('date')}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended justify-center rounded-md border border-neutral-300 bg-white px-md"
          >
            <Text className={`text-start text-md text-neutral-900 ${languageFontClass}`}>
              {displayedDate}
            </Text>
          </PressableScale>
          {preferredDate.length === 0 ? null : (
            <PressableScale
              testID="mentoring-preferred-date-clear"
              accessibilityLabel={t('mentoring:preferredDateClear')}
              onPress={clearDate}
              haptic="tapLight"
              className="min-h-recommended items-center justify-center self-start rounded-md px-md"
            >
              <Text className={`text-md font-bold text-primary ${languageFontClass}`}>
                {t('mentoring:preferredDateClear')}
              </Text>
            </PressableScale>
          )}
        </View>

        <View className="flex-1 gap-sm">
          <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
            {t('mentoring:preferredTimeLabel')}
          </Text>
          <PressableScale
            testID="mentoring-preferred-time"
            accessibilityLabel={`${t('mentoring:preferredTimeLabel')}: ${displayedTime}`}
            accessibilityHint={
              preferredDate.length === 0
                ? t('mentoring:preferredTimeNeedsDate')
                : t('mentoring:preferredTimeChoose')
            }
            isDisabled={preferredDate.length === 0}
            onPress={() => openPicker('time')}
            haptic="tapLight"
            style={continuousCorners}
            className={`min-h-recommended justify-center rounded-md border px-md ${
              preferredDate.length === 0
                ? 'border-neutral-200 bg-neutral-100'
                : 'border-neutral-300 bg-white'
            }`}
          >
            <Text
              className={`text-start text-md ${languageFontClass} ${
                preferredDate.length === 0 ? 'text-neutral-500' : 'text-neutral-900'
              }`}
            >
              {displayedTime}
            </Text>
          </PressableScale>
          {preferredDate.length === 0 ? (
            <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
              {t('mentoring:preferredTimeNeedsDate')}
            </Text>
          ) : preferredTime.length === 0 ? null : (
            <PressableScale
              testID="mentoring-preferred-time-clear"
              accessibilityLabel={t('mentoring:preferredTimeClear')}
              onPress={() => onPreferredTimeChange('')}
              haptic="tapLight"
              className="min-h-recommended items-center justify-center self-start rounded-md px-md"
            >
              <Text className={`text-md font-bold text-primary ${languageFontClass}`}>
                {t('mentoring:preferredTimeClear')}
              </Text>
            </PressableScale>
          )}
        </View>
      </View>

      {activePicker === null ? null : (
        <View className="gap-sm">
          <DateTimePicker
            testID={`mentoring-${activePicker}-picker`}
            value={draftValue}
            mode={activePicker}
            display={activePicker === 'date' ? 'inline' : 'compact'}
            presentation="dialog"
            is24Hour
            locale={language}
            accentColor={tokens.colors.primary.DEFAULT}
            onValueChange={handlePickerChange}
            onDismiss={() => setActivePicker(null)}
            positiveButton={{ label: t('mentoring:pickerDone') }}
            negativeButton={{ label: t('mentoring:pickerCancel') }}
          />
          {Platform.OS === 'ios' ? (
            <View className="flex-row flex-wrap justify-end gap-sm">
              <PressableScale
                accessibilityLabel={t('mentoring:pickerCancel')}
                onPress={() => setActivePicker(null)}
                className="min-h-recommended items-center justify-center rounded-md px-md"
              >
                <Text className={`text-md font-bold text-neutral-700 ${languageFontClass}`}>
                  {t('mentoring:pickerCancel')}
                </Text>
              </PressableScale>
              <PressableScale
                accessibilityLabel={t('mentoring:pickerDone')}
                onPress={confirmInlinePicker}
                haptic="success"
                className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
              >
                <Text className={`text-md font-bold text-white ${languageFontClass}`}>
                  {t('mentoring:pickerDone')}
                </Text>
              </PressableScale>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
