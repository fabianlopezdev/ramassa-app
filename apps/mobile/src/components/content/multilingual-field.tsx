/**
 * A text written in Catalan with its four translations (RAPP-341), the phone
 * side of the web admin's multilingual editor and translation review. The
 * Catalan text comes first. Once machine drafts exist, one tab per language
 * shows its state (needs review, approved, rejected); the open tab holds the
 * draft to correct, right to left for Arabic and Farsi, with Approve and
 * Reject. "Approve all" accepts every draft at once.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import {
  getLanguageDirection,
  LANGUAGE_NATIVE_NAMES,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';
import type { TranslationReview } from '@ramassa/shared/translation';

const STATUS_KEYS = {
  draft: 'reviewStatusDraft',
  approved: 'reviewStatusApproved',
  rejected: 'reviewStatusRejected',
} as const;

const rtlStyle = { writingDirection: 'rtl', textAlign: 'right' } as const;
const ltrStyle = { writingDirection: 'ltr', textAlign: 'left' } as const;

export function MultilingualField({
  testIDPrefix,
  label,
  value,
  onChangeText,
  review,
  onEdit,
  onApprove,
  onReject,
  onApproveAll,
  maxLength,
  multiline = false,
}: {
  readonly testIDPrefix: string;
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly review: TranslationReview | undefined;
  readonly onEdit: (language: SupportedLanguage, text: string) => void;
  readonly onApprove: (language: SupportedLanguage) => void;
  readonly onReject: (language: SupportedLanguage) => void;
  readonly onApproveAll: () => void;
  readonly maxLength: number;
  readonly multiline?: boolean;
}) {
  const { t } = useTranslation('announcements');
  const fontClass = useLanguageFontClass();
  const suggestions = review?.suggestions ?? [];
  const [openLanguage, setOpenLanguage] = useState<SupportedLanguage | null>(null);
  const open = suggestions.find((s) => s.language === openLanguage) ?? suggestions[0];

  return (
    <View className="gap-sm" testID={`${testIDPrefix}-field`}>
      <AuthTextField
        testID={`${testIDPrefix}-source`}
        label={label}
        value={value}
        onChangeText={onChangeText}
        maxLength={maxLength}
        multiline={multiline}
      />
      {open === undefined ? null : (
        <View
          style={continuousCorners}
          className="gap-sm rounded-md border border-neutral-200 bg-neutral-50 p-md"
        >
          {/* One row that scrolls sideways: four tabs side by side fit no phone. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-sm">
              {suggestions.map((suggestion) => (
                <ChoiceOption
                  key={suggestion.language}
                  testID={`${testIDPrefix}-tab-${suggestion.language}`}
                  value={suggestion.language}
                  label={`${suggestion.language.toUpperCase()} · ${t(STATUS_KEYS[suggestion.status])}`}
                  selected={suggestion.language === open.language}
                  onSelect={setOpenLanguage}
                  languageFontClass={fontClass}
                />
              ))}
            </View>
          </ScrollView>
          <AuthTextField
            testID={`${testIDPrefix}-draft-${open.language}`}
            label={t('languageDraft', { language: LANGUAGE_NATIVE_NAMES[open.language] })}
            value={open.reviewedText}
            onChangeText={(text) => onEdit(open.language, text)}
            maxLength={maxLength}
            multiline={multiline}
            style={getLanguageDirection(open.language) === 'rtl' ? rtlStyle : ltrStyle}
          />
          <View className="flex-row flex-wrap gap-sm">
            <PressableScale
              testID={`${testIDPrefix}-approve-${open.language}`}
              accessibilityRole="button"
              accessibilityLabel={t('approve')}
              onPress={() => onApprove(open.language)}
              haptic="selection"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
            >
              <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
                {t('approve')}
              </Text>
            </PressableScale>
            <PressableScale
              testID={`${testIDPrefix}-reject-${open.language}`}
              accessibilityRole="button"
              accessibilityLabel={t('reject')}
              onPress={() => onReject(open.language)}
              haptic="selection"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 bg-white px-lg"
            >
              <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
                {t('reject')}
              </Text>
            </PressableScale>
            <PressableScale
              testID={`${testIDPrefix}-approve-all`}
              accessibilityRole="button"
              accessibilityLabel={t('approveAll')}
              onPress={onApproveAll}
              haptic="selection"
              className="min-h-recommended justify-center px-sm"
            >
              <Text className={`font-semibold text-primary-dark ${fontClass}`}>
                {t('approveAll')}
              </Text>
            </PressableScale>
          </View>
        </View>
      )}
    </View>
  );
}
