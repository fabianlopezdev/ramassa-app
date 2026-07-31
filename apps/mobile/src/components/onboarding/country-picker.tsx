/**
 * The nationality picker (RAPP-21), implementing the RAPP-4 contract's
 * "country picker (ISO list, localized names)". A picker rather than free
 * text because the field feeds aggregate impact reporting: one misplaced
 * finger turning Ucraïna into Ucrania is a new reporting bucket, and the
 * whole point of the field dies by a thousand of those.
 *
 * Shape: the roster's own nationalities pinned as one-tap chips (most players
 * answer without typing at all), then a search over the full ISO list that
 * matches EVERY language's name, so a player whose app is in Arabic can still
 * type the Latin spelling she knows from her documents. Displayed labels are
 * in her language; the STORED value is the Catalan name from the shared data,
 * identical from every locale.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { PressableScale } from '@/components/motion/pressable-scale';
import { OptionChip } from '@/components/onboarding/option-chip';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  COMMON_COUNTRY_CODES,
  countryLabelForCanonical,
  getCountryOptions,
  searchCountries,
  type CountryOption,
} from '@ramassa/shared/i18n';
import type { LanguageCode } from '@ramassa/shared/schemas';

export interface CountryPickerProps {
  readonly label: string;
  /** The stored canonical (Catalan) name, or '' when nothing is chosen yet. */
  readonly value: string;
  readonly onChange: (canonical: string) => void;
  readonly errorMessage?: string;
}

export function CountryPicker({ label, value, onChange, errorMessage }: CountryPickerProps) {
  const { t, i18n } = useTranslation('onboarding');
  const languageFontClass = useLanguageFontClass();
  const locale = (i18n.resolvedLanguage as LanguageCode) ?? 'ca';

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const options = useMemo(() => getCountryOptions(locale), [locale]);
  const commonOptions = useMemo(
    () =>
      COMMON_COUNTRY_CODES.map((code) => options.find((option) => option.code === code)).filter(
        (option): option is CountryOption => option !== undefined,
      ),
    [options],
  );
  const filtered = useMemo(() => searchCountries(options, query), [options, query]);

  const displayValue = value === '' ? null : (countryLabelForCanonical(value, locale) ?? value);
  const hasError = Boolean(errorMessage);

  function choose(option: CountryOption) {
    onChange(option.canonical);
    setQuery('');
    setIsOpen(false);
  }

  return (
    <View className="gap-xs">
      <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
        {label}
      </Text>

      {/* The roster's nationalities: for most players the answer is one tap. */}
      <View className="flex-row flex-wrap gap-sm">
        {commonOptions.map((option) => (
          <OptionChip
            key={option.code}
            label={option.label}
            isSelected={value === option.canonical}
            onPress={() => choose(option)}
          />
        ))}
        <OptionChip
          label={
            displayValue !== null && !commonOptions.some((o) => o.canonical === value)
              ? displayValue
              : t('searchCountryPlaceholder')
          }
          isSelected={displayValue !== null && !commonOptions.some((o) => o.canonical === value)}
          onPress={() => setIsOpen(true)}
        />
      </View>

      {hasError ? (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${languageFontClass}`}
        >
          {errorMessage}
        </Text>
      ) : null}

      <Modal visible={isOpen} animationType="slide" onRequestClose={() => setIsOpen(false)}>
        <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
          <View className="flex-1 gap-md p-lg">
            <View className="flex-row items-center justify-between">
              <PressableScale
                accessibilityLabel={t('cancelAction')}
                onPress={() => setIsOpen(false)}
                haptic="selection"
                className="min-h-min justify-center py-sm"
              >
                <Text className={`text-md font-medium text-primary ${languageFontClass}`}>
                  {t('cancelAction')}
                </Text>
              </PressableScale>
              <Text
                accessibilityRole="header"
                className={`text-lg font-semibold text-neutral-900 ${languageFontClass}`}
              >
                {label}
              </Text>
            </View>

            <AuthTextField
              label={t('searchCountryPlaceholder')}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />

            <FlatList
              data={filtered}
              keyExtractor={(option) => option.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <PressableScale
                  accessibilityLabel={item.label}
                  isSelected={value === item.canonical}
                  onPress={() => choose(item)}
                  haptic="selection"
                  style={continuousCorners}
                  className={`min-h-recommended justify-center rounded-md px-md ${
                    value === item.canonical ? 'bg-primary' : ''
                  }`}
                >
                  <Text
                    className={`text-start text-md ${
                      value === item.canonical ? 'font-medium text-white' : 'text-neutral-900'
                    } ${languageFontClass}`}
                  >
                    {item.label}
                  </Text>
                </PressableScale>
              )}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
