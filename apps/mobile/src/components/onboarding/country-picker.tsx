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
import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Text, View, type ListRenderItemInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  COMMON_COUNTRY_CODES,
  countryLabelForCanonical,
  getCountryOptions,
  searchCountries,
  type CountryOption,
} from '@ramassa/shared/i18n';
import type { LanguageCode } from '@ramassa/shared/schemas';

/**
 * Row classes as hoisted constants rather than a template literal rebuilt per
 * row per keystroke (contract rule 17's perf clause). Written out in full, not
 * composed, so Tailwind's scanner still sees every utility as a literal.
 */
const COUNTRY_ROW_CLASS = 'min-h-recommended justify-center rounded-md px-md';
const COUNTRY_ROW_SELECTED_CLASS = 'min-h-recommended justify-center rounded-md bg-primary px-md';
const COUNTRY_LABEL_CLASS = 'text-start text-md text-neutral-900';
const COUNTRY_LABEL_SELECTED_CLASS = 'text-start text-md font-medium text-white';

/**
 * How many rows the list draws before its first commit. A row is 56dp
 * (`tapTarget.recommended`), so a phone's worth of sheet under the search field
 * is about twelve: enough to fill the viewport in ONE pass, rather than paint a
 * short list and visibly extend it a beat later.
 */
const INITIAL_ROWS = 12;

/**
 * How many viewports of rows stay mounted around the visible one.
 *
 * This is the single most important number on this screen. Every row is a
 * `PressableScale`, which is a native gesture handler plus a Reanimated shared
 * value and worklet, so a mounted row costs far more than a `<Text>`. The list
 * holds 265 countries at 56dp = ~14,800dp of content, and FlatList's DEFAULT
 * `windowSize` of 21 covers ~14,700dp on a phone: the default therefore mounts
 * essentially EVERY country. Five viewports caps that at roughly sixty rows,
 * which is what keeps the sheet openable on the low-end Android this audience
 * actually holds.
 */
const MOUNTED_VIEWPORTS = 5;

/** How many rows each incremental batch adds; smaller batches block for less. */
const ROWS_PER_BATCH = 8;

/** Stable across renders, so FlatList is not handed a new extractor per keystroke. */
function countryKey(option: CountryOption): string {
  return option.code;
}

interface CountryRowProps {
  readonly label: string;
  readonly canonical: string;
  readonly isSelected: boolean;
  /** The script class, passed in rather than hooked: see the memo note below. */
  readonly fontClass: string;
  readonly onSelect: (canonical: string) => void;
}

/**
 * One country. Its own component, and memoized on PRIMITIVES only, because it
 * is re-rendered by every keystroke in the search field: the parent owns the
 * query, so typing re-runs `renderItem` for every mounted row. With primitive
 * props and a stable `onSelect`, a row whose label and selection did not change
 * skips its work entirely.
 *
 * `fontClass` arrives as a prop instead of the row calling
 * `useLanguageFontClass()` itself: a hook subscribing every mounted row to i18n
 * is exactly the "keep list items lightweight" failure, and the value is
 * identical for all of them.
 */
const CountryRow = memo(function CountryRow({
  label,
  canonical,
  isSelected,
  fontClass,
  onSelect,
}: CountryRowProps) {
  const handlePress = useCallback(() => onSelect(canonical), [onSelect, canonical]);

  return (
    <PressableScale
      accessibilityLabel={label}
      isSelected={isSelected}
      onPress={handlePress}
      haptic="selection"
      style={continuousCorners}
      className={isSelected ? COUNTRY_ROW_SELECTED_CLASS : COUNTRY_ROW_CLASS}
    >
      <Text
        className={`${isSelected ? COUNTRY_LABEL_SELECTED_CLASS : COUNTRY_LABEL_CLASS} ${fontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
});

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

  /**
   * The list follows the typing at a lower priority (React 19 concurrent, no
   * dependency). The FILTER is not the expensive half: searching all 265
   * countries across all five languages measures ~0.14ms, comfortably inside a
   * frame even after a Hermes-on-cheap-Android multiple. What costs is the
   * re-render it triggers, which mounts and unmounts gesture-handler rows. So
   * this is deliberately NOT a debounce: a debounce would delay the answer for
   * everyone, where deferring lets the typed character land on its own frame
   * and only the list arrive late, and only when the device is actually busy.
   */
  const deferredQuery = useDeferredValue(query);

  const options = useMemo(() => getCountryOptions(locale), [locale]);
  const commonOptions = useMemo(
    () =>
      COMMON_COUNTRY_CODES.map((code) => options.find((option) => option.code === code)).filter(
        (option): option is CountryOption => option !== undefined,
      ),
    [options],
  );
  const filtered = useMemo(() => searchCountries(options, deferredQuery), [options, deferredQuery]);

  const displayValue = value === '' ? null : (countryLabelForCanonical(value, locale) ?? value);
  const hasError = Boolean(errorMessage);

  /**
   * Her answer when it is NOT one of the pinned chips, so the search chip can
   * wear it instead of the generic "Search" and show itself as the selected
   * one. Null whenever a pinned chip already carries the answer, or nothing is
   * answered yet.
   *
   * Named once rather than inlined twice: the label and the selected state are
   * two faces of the same question, and computing it separately in each is how
   * a chip ends up reading "Search" while looking selected.
   */
  const searchedSelectionLabel =
    displayValue !== null && !commonOptions.some((option) => option.canonical === value)
      ? displayValue
      : null;

  /**
   * ONE instance for the whole list, keyed on the canonical value rather than
   * closing over an option object, so every row can share it and none of them
   * is invalidated by a keystroke.
   */
  const choose = useCallback(
    (canonical: string) => {
      onChange(canonical);
      setQuery('');
      setIsOpen(false);
    },
    [onChange],
  );

  const renderCountry = useCallback(
    ({ item }: ListRenderItemInfo<CountryOption>) => (
      <CountryRow
        label={item.label}
        canonical={item.canonical}
        isSelected={value === item.canonical}
        fontClass={languageFontClass}
        onSelect={choose}
      />
    ),
    [value, languageFontClass, choose],
  );

  // An ELEMENT, not a component function: passing an inline `() => <Text/>` to
  // `ListEmptyComponent` gives FlatList a brand-new component type on every
  // keystroke, which remounts the node and re-announces it mid-typing.
  const emptyMessage = (
    <Text
      accessibilityLiveRegion="polite"
      className={`text-start text-md text-neutral-500 ${languageFontClass}`}
    >
      {t('noCountryResults')}
    </Text>
  );

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
            onPress={() => choose(option.canonical)}
          />
        ))}
        <OptionChip
          label={searchedSelectionLabel ?? t('searchCountryPlaceholder')}
          isSelected={searchedSelectionLabel !== null}
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
        {/* `accessibilityViewIsModal` traps VoiceOver inside the sheet. Without
            it iOS keeps offering the wizard underneath, so a swipe walks out of
            the search into a form the player cannot see and cannot get back
            from without finding the Cancel control again. */}
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
              label={t('searchCountryPlaceholder')}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />

            {/* `flex-1` is load-bearing, the RAPP-96 lesson applied to this
                list: a scrolling container with no flex basis in a flex column
                is free to size itself to its CONTENT, and a list of every
                country in the world sized to its content has a scroll range of
                zero. Bounded here to the space left under the search field, so
                what scrolls is the list and not nothing. */}
            <FlatList
              className="flex-1"
              data={filtered}
              keyExtractor={countryKey}
              accessibilityRole="list"
              accessibilityLabel={label}
              contentInsetAdjustmentBehavior="automatic"
              keyboardShouldPersistTaps="handled"
              // A search that matches nothing must SAY so. An empty list is a
              // blank white sheet: sighted or not, the player cannot tell
              // whether her country is missing, whether the app is still
              // thinking, or whether she broke something.
              ListEmptyComponent={emptyMessage}
              renderItem={renderCountry}
              // Windowing, sized for a cheap Android rather than left at the
              // defaults, which for a list this long mount every country at
              // once. See MOUNTED_VIEWPORTS.
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
