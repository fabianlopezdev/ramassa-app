/**
 * A searchable list staff wrote (RAPP-610), for a choice too long for cards:
 * it looks and behaves exactly like the country picker (RAPP-21). One field
 * opens a sheet with a search box and the list; the search matches the option
 * in every language staff wrote it in, accents ignored. The stored value is
 * the option's id, the same from every language.
 */

import { useAppLock } from '@/components/auth/app-lock';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { useFormFieldAppearance } from '@/components/forms/field-appearance';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { memo, useCallback, useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, Text, View, type ListRenderItemInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** The same row classes as the country picker, written out for Tailwind's scanner. */
const OPTION_ROW_CLASS = 'min-h-recommended justify-center rounded-md px-md active:opacity-70';
const OPTION_ROW_SELECTED_CLASS =
  'min-h-recommended justify-center rounded-md bg-primary px-md active:opacity-70';
const OPTION_LABEL_CLASS = 'text-start text-form text-neutral-900';
const OPTION_LABEL_SELECTED_CLASS = 'text-start text-form font-medium text-white';

/** The country picker's windowing: one viewport first, small batches after. */
const INITIAL_ROWS = 12;
const MOUNTED_VIEWPORTS = 5;
const ROWS_PER_BATCH = 8;

export interface SearchOption {
  readonly id: string;
  /** In her language, with the Catalan fallback. */
  readonly label: string;
  /** Every language staff wrote, for the search. */
  readonly searchText: string;
}

/** Lowercase without accents, so "Gracia" finds "Gràcia". */
function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function searchOptions(options: readonly SearchOption[], query: string): readonly SearchOption[] {
  const folded = foldForSearch(query);
  if (folded === '') return options;
  return options.filter((option) => foldForSearch(option.searchText).includes(folded));
}

function optionKey(option: SearchOption): string {
  return option.id;
}

const OptionRow = memo(function OptionRow({
  id,
  label,
  isSelected,
  fontClass,
  onSelect,
}: {
  readonly id: string;
  readonly label: string;
  readonly isSelected: boolean;
  readonly fontClass: string;
  readonly onSelect: (id: string) => void;
}) {
  const handlePress = useCallback(() => {
    playHaptic('selection');
    onSelect(id);
  }, [onSelect, id]);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      onPress={handlePress}
      style={continuousCorners}
      className={isSelected ? OPTION_ROW_SELECTED_CLASS : OPTION_ROW_CLASS}
    >
      <Text
        className={`${isSelected ? OPTION_LABEL_SELECTED_CLASS : OPTION_LABEL_CLASS} ${fontClass}`}
      >
        {label}
      </Text>
    </Pressable>
  );
});

export function OptionSearchPicker({
  label,
  help,
  value,
  options,
  onChange,
  errorMessage,
  testID,
}: {
  readonly label: string;
  readonly help?: ReactNode;
  /** The chosen option id, or '' when nothing is chosen yet. */
  readonly value: string;
  readonly options: readonly SearchOption[];
  readonly onChange: (id: string) => void;
  readonly errorMessage?: string;
  readonly testID: string;
}) {
  const { t } = useTranslation('onboarding');
  const languageFontClass = useLanguageFontClass();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const { isCovered } = useAppLock();
  const filtered = useMemo(() => searchOptions(options, deferredQuery), [options, deferredQuery]);
  const displayValue = options.find((option) => option.id === value)?.label ?? null;
  const hasError = Boolean(errorMessage);
  const fieldAppearance = useFormFieldAppearance(hasError);

  const closePicker = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);
  const choose = useCallback(
    (id: string) => {
      onChange(id);
      setQuery('');
      setIsOpen(false);
    },
    [onChange],
  );
  const renderOption = useCallback(
    ({ item }: ListRenderItemInfo<SearchOption>) => (
      <OptionRow
        id={item.id}
        label={item.label}
        isSelected={value === item.id}
        fontClass={languageFontClass}
        onSelect={choose}
      />
    ),
    [value, languageFontClass, choose],
  );
  const emptyMessage = (
    <Text
      accessibilityLiveRegion="polite"
      className={`text-start text-form text-neutral-700 ${languageFontClass}`}
    >
      {t('customNoSearchResults')}
    </Text>
  );

  return (
    <View className="gap-xs" testID={testID}>
      <Text className={`text-start text-form font-medium text-neutral-800 ${languageFontClass}`}>
        {label}
      </Text>
      {help}
      <PressableScale
        testID={`${testID}-open`}
        accessibilityLabel={`${label}: ${displayValue ?? t('customSearchPlaceholder')}`}
        accessibilityHint={errorMessage}
        isExpanded={isOpen}
        onPress={() => setIsOpen(true)}
        haptic="selection"
        style={fieldAppearance.style}
        className={`${fieldAppearance.className} justify-center`}
      >
        <Text
          className={`text-start text-form ${displayValue === null ? 'text-neutral-700' : 'text-neutral-900'} ${languageFontClass}`}
        >
          {displayValue ?? t('customSearchPlaceholder')}
        </Text>
      </PressableScale>
      {hasError ? (
        <Text
          selectable
          accessibilityLiveRegion="polite"
          className={`text-start text-form text-error ${languageFontClass}`}
        >
          {errorMessage}
        </Text>
      ) : null}

      <Modal visible={isOpen && !isCovered} animationType="slide" onRequestClose={closePicker}>
        <SafeAreaView
          accessibilityViewIsModal
          className="flex-1 bg-white"
          edges={['top', 'bottom']}
        >
          <View className="flex-1 gap-md p-lg">
            <View className="flex-row items-center justify-between">
              <Pressable
                testID={`${testID}-cancel`}
                accessibilityRole="button"
                accessibilityLabel={t('cancelAction')}
                onPress={() => {
                  playHaptic('selection');
                  closePicker();
                }}
                className="min-h-recommended min-w-min justify-center py-sm active:opacity-70"
              >
                <Text className={`text-form font-medium text-primary ${languageFontClass}`}>
                  {t('cancelAction')}
                </Text>
              </Pressable>
              <Text
                accessibilityRole="header"
                className={`text-form font-semibold text-neutral-900 ${languageFontClass}`}
              >
                {label}
              </Text>
            </View>
            <AuthTextField
              testID={`${testID}-search`}
              label={t('customSearchPlaceholder')}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <FlatList
              className="flex-1"
              data={filtered}
              keyExtractor={optionKey}
              accessibilityRole="list"
              accessibilityLabel={label}
              contentInsetAdjustmentBehavior="automatic"
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={emptyMessage}
              renderItem={renderOption}
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
