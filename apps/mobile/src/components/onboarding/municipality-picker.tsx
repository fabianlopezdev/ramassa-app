/** Searchable canonical IDESCAT municipality picker (RAPP-100). */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { PressableScale } from '@/components/motion/pressable-scale';
import { OnboardingQuestionHeading } from '@/components/onboarding/onboarding-question-heading';
import { OptionChip } from '@/components/onboarding/option-chip';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { SymbolViewProps } from 'expo-symbols';
import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, Text, View, type ListRenderItemInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  COMMON_MUNICIPALITY_CODES,
  getMunicipalityOptions,
  municipalityLabelForCanonical,
  searchMunicipalities,
  type MunicipalityOption,
} from '@ramassa/shared/i18n/municipalities';
import type { LanguageCode } from '@ramassa/shared/schemas';

const MUNICIPALITY_ROW_CLASS = 'min-h-recommended justify-center rounded-md px-md';
const MUNICIPALITY_ROW_SELECTED_CLASS =
  'min-h-recommended justify-center rounded-md bg-primary px-md';
const MUNICIPALITY_LABEL_CLASS = 'text-start text-md text-neutral-900';
const MUNICIPALITY_LABEL_SELECTED_CLASS = 'text-start text-md font-medium text-white';
const INITIAL_ROWS = 12;
const MOUNTED_VIEWPORTS = 5;
const ROWS_PER_BATCH = 8;

function municipalityKey(option: MunicipalityOption): string {
  return option.code;
}

interface MunicipalityRowProps {
  readonly code: string;
  readonly label: string;
  readonly canonical: string;
  readonly isSelected: boolean;
  readonly fontClass: string;
  readonly onSelect: (canonical: string) => void;
}

const MunicipalityRow = memo(function MunicipalityRow({
  code,
  label,
  canonical,
  isSelected,
  fontClass,
  onSelect,
}: MunicipalityRowProps) {
  // FlatList's native responder must own this tap while the search IME is open.
  // A nested gesture-handler tap loses that contest on Android, so this one
  // virtualized row deliberately uses Pressable without changing the shared
  // PressableScale contract used by ordinary controls.
  const handlePress = useCallback(() => {
    playHaptic('selection');
    onSelect(canonical);
  }, [onSelect, canonical]);

  return (
    <Pressable
      testID={`municipality-option-${code}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected }}
      onPress={handlePress}
      style={continuousCorners}
      className={isSelected ? MUNICIPALITY_ROW_SELECTED_CLASS : MUNICIPALITY_ROW_CLASS}
    >
      <Text
        className={`${isSelected ? MUNICIPALITY_LABEL_SELECTED_CLASS : MUNICIPALITY_LABEL_CLASS} ${fontClass}`}
      >
        {label}
      </Text>
    </Pressable>
  );
});

export interface MunicipalityPickerProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (canonical: string) => void;
  readonly errorMessage?: string;
  readonly symbol?: SymbolViewProps['name'];
}

export function MunicipalityPicker({
  label,
  value,
  onChange,
  errorMessage,
  symbol,
}: MunicipalityPickerProps) {
  const { t, i18n } = useTranslation('onboarding');
  const languageFontClass = useLanguageFontClass();
  const locale = (i18n.resolvedLanguage as LanguageCode) ?? 'ca';
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const options = useMemo(() => getMunicipalityOptions(locale), [locale]);
  const commonOptions = useMemo(
    () =>
      COMMON_MUNICIPALITY_CODES.map((code) =>
        options.find((option) => option.code === code),
      ).filter((option): option is MunicipalityOption => option !== undefined),
    [options],
  );
  const filtered = useMemo(
    () => searchMunicipalities(options, deferredQuery),
    [options, deferredQuery],
  );
  const displayValue =
    value === '' ? null : (municipalityLabelForCanonical(value, locale) ?? value);
  const searchedSelectionLabel =
    displayValue !== null && !commonOptions.some((option) => option.canonical === value)
      ? displayValue
      : null;

  const choose = useCallback(
    (canonical: string) => {
      onChange(canonical);
      setQuery('');
      setIsOpen(false);
    },
    [onChange],
  );
  const renderMunicipality = useCallback(
    ({ item }: ListRenderItemInfo<MunicipalityOption>) => (
      <MunicipalityRow
        code={item.code}
        label={item.label}
        canonical={item.canonical}
        isSelected={value === item.canonical}
        fontClass={languageFontClass}
        onSelect={choose}
      />
    ),
    [value, languageFontClass, choose],
  );
  const emptyMessage = (
    <Text
      accessibilityLiveRegion="polite"
      className={`text-start text-md text-neutral-500 ${languageFontClass}`}
    >
      {t('noMunicipalityResults')}
    </Text>
  );

  return (
    <View className="gap-xs">
      {symbol === undefined ? (
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {label}
        </Text>
      ) : (
        <OnboardingQuestionHeading label={label} symbol={symbol} />
      )}
      <View className="flex-row flex-wrap gap-sm">
        <OptionChip
          testID="municipality-picker-clear"
          label={t('municipalityNone')}
          isSelected={value === ''}
          onPress={() => choose('')}
        />
        {commonOptions.map((option) => (
          <OptionChip
            key={option.code}
            label={option.label}
            isSelected={value === option.canonical}
            onPress={() => choose(option.canonical)}
          />
        ))}
        <OptionChip
          testID="municipality-picker-open"
          label={searchedSelectionLabel ?? t('searchMunicipalityPlaceholder')}
          isSelected={searchedSelectionLabel !== null}
          onPress={() => setIsOpen(true)}
        />
      </View>

      {errorMessage === undefined ? null : (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${languageFontClass}`}
        >
          {errorMessage}
        </Text>
      )}

      <Modal visible={isOpen} animationType="slide" onRequestClose={() => setIsOpen(false)}>
        <SafeAreaView
          accessibilityViewIsModal
          className="flex-1 bg-white"
          edges={['top', 'bottom']}
        >
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
              testID="municipality-search-input"
              label={t('searchMunicipalityPlaceholder')}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="done"
              submitBehavior="blurAndSubmit"
            />

            <FlatList
              testID="municipality-results"
              className="flex-1"
              data={filtered}
              keyExtractor={municipalityKey}
              accessibilityRole="list"
              accessibilityLabel={label}
              contentInsetAdjustmentBehavior="automatic"
              keyboardShouldPersistTaps="always"
              ListEmptyComponent={emptyMessage}
              renderItem={renderMunicipality}
              initialNumToRender={INITIAL_ROWS}
              maxToRenderPerBatch={ROWS_PER_BATCH}
              windowSize={MOUNTED_VIEWPORTS}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
