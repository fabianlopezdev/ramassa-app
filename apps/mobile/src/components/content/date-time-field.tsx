/**
 * A date and time for publishing content (RAPP-341): a date button and a time
 * button over one ISO value, with the native pickers the mentoring screen uses.
 * The web build has its own file (`date-time-field.web.tsx`), because the
 * native picker draws nothing there. With `inMadridTime` (event times,
 * RAPP-342) it shows and sets the Madrid wall clock.
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
import {
  combineDateAndTime,
  defaultPickerDate,
  DEVICE_CLOCK,
  MADRID_CLOCK,
} from './date-time-value';

export interface DateTimeFieldProps {
  readonly testID: string;
  readonly label: string;
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
  /** Shown when there is no value; with it, the value can be removed. */
  readonly emptyLabel?: string;
  /** The value is a Madrid time, shown and picked as such. */
  readonly inMadridTime?: boolean;
}

type PickerMode = 'date' | 'time';

export function DateTimeField({
  testID,
  label,
  value,
  onChange,
  emptyLabel,
  inMadridTime = false,
}: DateTimeFieldProps) {
  const { t, i18n } = useTranslation(['mentoring', 'announcements']);
  const fontClass = useLanguageFontClass();
  const language = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const [activePicker, setActivePicker] = useState<PickerMode | null>(null);
  const clock = inMadridTime ? MADRID_CLOCK : DEVICE_CLOCK;
  const [draft, setDraft] = useState(() => defaultPickerDate(value, undefined, clock));
  const formats = useMemo(
    () => ({
      date: new Intl.DateTimeFormat(language, { dateStyle: 'medium' }),
      time: new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }),
    }),
    [language],
  );
  const current = value === null ? null : clock.toPicker(value);

  const open = (mode: PickerMode) => {
    setDraft(defaultPickerDate(value, undefined, clock));
    setActivePicker(mode);
  };
  const commit = (mode: PickerMode, picked: Date) => {
    onChange(
      clock.fromPicker(
        combineDateAndTime(defaultPickerDate(value, undefined, clock), picked, mode),
      ),
    );
  };
  const handleChange = (_event: unknown, picked: Date) => {
    setDraft(picked);
    if (Platform.OS === 'android' && activePicker !== null) {
      commit(activePicker, picked);
      setActivePicker(null);
    }
  };

  const button = (mode: PickerMode, text: string) => (
    <PressableScale
      testID={`${testID}-${mode}`}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${text}`}
      onPress={() => open(mode)}
      haptic="tapLight"
      style={continuousCorners}
      className="min-h-recommended flex-1 justify-center rounded-md border border-neutral-300 bg-white px-md"
    >
      <Text className={`text-start text-md text-neutral-900 ${fontClass}`}>{text}</Text>
    </PressableScale>
  );

  return (
    <View className="gap-xs">
      <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
        {label}
      </Text>
      <View className="flex-row gap-sm">
        {button('date', current === null ? (emptyLabel ?? '') : formats.date.format(current))}
        {current === null ? null : button('time', formats.time.format(current))}
      </View>
      {current === null || emptyLabel === undefined ? null : (
        <PressableScale
          testID={`${testID}-clear`}
          accessibilityRole="button"
          accessibilityLabel={t('announcements:clearDate')}
          onPress={() => onChange(null)}
          haptic="tapLight"
          className="min-h-recommended justify-center self-start"
        >
          <Text className={`font-semibold text-primary-dark ${fontClass}`}>
            {t('announcements:clearDate')}
          </Text>
        </PressableScale>
      )}
      {activePicker === null ? null : (
        <View className="gap-sm">
          <DateTimePicker
            testID={`${testID}-${activePicker}-picker`}
            value={draft}
            mode={activePicker}
            display={activePicker === 'date' ? 'inline' : 'compact'}
            presentation="dialog"
            is24Hour
            locale={language}
            accentColor={tokens.colors.primary.DEFAULT}
            onValueChange={handleChange}
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
                <Text className={`text-md font-bold text-neutral-700 ${fontClass}`}>
                  {t('mentoring:pickerCancel')}
                </Text>
              </PressableScale>
              <PressableScale
                testID={`${testID}-done`}
                accessibilityLabel={t('mentoring:pickerDone')}
                onPress={() => {
                  commit(activePicker, draft);
                  setActivePicker(null);
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
      )}
    </View>
  );
}
