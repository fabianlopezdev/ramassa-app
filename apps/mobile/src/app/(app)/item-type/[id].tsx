/**
 * Edit an item, or add one (RAPP-253, `/item-type/new`). A custom item has a
 * name in Catalan and, when given, the other four languages. Built-in items
 * keep the app's name, their kind and code letters; their sizes, usual value
 * and whether they are in use can change. A size that still has stock cannot
 * be removed: the database refuses it and the screen names the size.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FailureNotice } from '@/components/error-code-line';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { readValue } from '@/lib/arrival-form';
import { continuousCorners } from '@/lib/continuous-corners';
import { useHandoverItemTypes } from '@/lib/handover';
import { useItemLabel } from '@/lib/item-label';
import { useSaveItemType } from '@/lib/stock';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  centsToEuroText,
  cleanSizes,
  ITEM_NAME_LANGUAGES,
  type ItemName,
} from '@ramassa/shared/equipment';
import { toAppError, type AppError } from '@ramassa/shared/errors';
import { LANGUAGE_NATIVE_NAMES } from '@ramassa/shared/i18n';

type Kind = 'player_kit' | 'team_equipment';

function Section({
  title,
  hint,
  children,
}: {
  readonly title: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <View className="gap-sm">
      <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>{title}</Text>
      {children}
      {hint === undefined ? null : (
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>{hint}</Text>
      )}
    </View>
  );
}

export default function ItemTypeScreen() {
  const { id = 'new' } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  const { t } = useTranslation('participants');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const itemLabel = useItemLabel();
  const itemTypes = useHandoverItemTypes();
  const saveItem = useSaveItemType();
  const isNew = id === 'new';
  const current = isNew ? null : ((itemTypes.data ?? []).find((type) => type.id === id) ?? null);
  const isBuiltin = current?.is_builtin ?? false;

  const [name, setName] = useState<ItemName>({});
  const [kind, setKind] = useState<Kind>('team_equipment');
  const [sizes, setSizes] = useState<readonly string[]>([]);
  const [newSize, setNewSize] = useState('');
  const [valueText, setValueText] = useState('');
  const [code, setCode] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  // Fill the form once the item has loaded.
  useEffect(() => {
    if (current === null || loadedId === current.id) return;
    setLoadedId(current.id);
    setName(current.name ?? {});
    setKind(current.kind);
    setSizes(current.sizes);
    setValueText(centsToEuroText(current.default_value_cents));
    setCode(current.code_prefix ?? '');
    setIsActive(current.is_active);
  }, [current, loadedId]);

  const value = readValue(valueText);
  const hasName = isBuiltin || (name.ca ?? '').trim().length > 0;
  const canSave = hasName && value.ok && !saveItem.isPending;

  const addSize = () => {
    setSizes((current) => cleanSizes([...current, newSize]));
    setNewSize('');
  };
  const save = () => {
    if (!canSave) return;
    setError(null);
    saveItem.mutate(
      {
        id: isNew ? null : id,
        name,
        kind,
        sizes,
        defaultValueCents: value.cents,
        codePrefix: code,
        isActive,
      },
      { onSuccess: () => back(), onError: (thrown) => setError(toAppError(thrown)) },
    );
  };

  const errorMessage = (() => {
    if (error === null) return null;
    const inStock = /STOCK\/SIZE_IN_STOCK: (.*)$/.exec(error.message);
    if (inStock !== null) return t('items.sizeInStock', { size: inStock[1] });
    if (/code_prefix|duplicate key/.test(error.message)) return t('items.codeTaken');
    return t('items.saveFailed');
  })();

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-3xl"
      >
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="item-back"
            accessibilityLabel={tCommon('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {tCommon('back')}
            </Text>
          </PressableScale>
          <Text
            accessibilityRole="header"
            className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
          >
            {isNew || current === null
              ? t('items.newTitle')
              : t('items.editTitle', { item: itemLabel(current.key) })}
          </Text>

          {isBuiltin ? (
            <Text className={`text-start text-md text-neutral-700 ${fontClass}`}>
              {t('items.builtin')}
            </Text>
          ) : (
            <View className="gap-sm">
              {ITEM_NAME_LANGUAGES.map((language) => (
                <AuthTextField
                  key={language}
                  testID={`item-name-${language}`}
                  label={t('items.nameLabel', { language: LANGUAGE_NATIVE_NAMES[language] })}
                  value={name[language] ?? ''}
                  onChangeText={(text) => setName((current) => ({ ...current, [language]: text }))}
                  maxLength={60}
                />
              ))}
              {hasName ? null : (
                <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                  {t('items.nameRequired')}
                </Text>
              )}
            </View>
          )}

          {isBuiltin ? null : (
            <Section title={t('items.kindLabel')} hint={t('items.kindHint')}>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel={t('items.kindLabel')}
                className="flex-row flex-wrap gap-sm"
              >
                {(['player_kit', 'team_equipment'] as const).map((candidate) => (
                  <ChoiceOption
                    key={candidate}
                    testID={`item-kind-${candidate}`}
                    value={candidate}
                    label={t(`items.kind.${candidate}`)}
                    selected={candidate === kind}
                    onSelect={setKind}
                    languageFontClass={fontClass}
                  />
                ))}
              </View>
            </Section>
          )}

          <Section title={t('items.sizesLabel')} hint={t('items.sizesHint')}>
            <View className="flex-row flex-wrap gap-sm">
              {sizes.length === 0 ? (
                <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                  {t('items.noSizes')}
                </Text>
              ) : null}
              {sizes.map((size) => (
                <PressableScale
                  key={size}
                  testID={`item-size-remove-${size}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('items.removeSize', { size })}
                  onPress={() =>
                    setSizes((current) => current.filter((candidate) => candidate !== size))
                  }
                  haptic="selection"
                  style={continuousCorners}
                  className="min-h-recommended min-w-recommended flex-row items-center justify-center gap-xs rounded-md border border-neutral-300 bg-white px-md"
                >
                  <Text className={`font-semibold text-neutral-900 ${fontClass}`}>{size}</Text>
                  <Text className="text-neutral-500">×</Text>
                </PressableScale>
              ))}
            </View>
            <View className="flex-row items-end gap-sm">
              <View className="flex-1">
                <AuthTextField
                  testID="item-new-size"
                  label={t('items.newSize')}
                  value={newSize}
                  onChangeText={setNewSize}
                  maxLength={20}
                  autoCapitalize="characters"
                  onSubmitEditing={addSize}
                />
              </View>
              <PressableScale
                testID="item-add-size"
                accessibilityRole="button"
                accessibilityLabel={t('items.addSize')}
                onPress={addSize}
                isDisabled={newSize.trim() === ''}
                haptic="tapLight"
                style={continuousCorners}
                className="min-h-recommended items-center justify-center rounded-md border border-primary px-md"
              >
                <Text className={`font-bold text-primary-dark ${fontClass}`}>
                  {t('items.addSize')}
                </Text>
              </PressableScale>
            </View>
          </Section>

          <AuthTextField
            testID="item-value"
            label={t('items.valueLabel')}
            value={valueText}
            onChangeText={setValueText}
            keyboardType="decimal-pad"
            errorMessage={value.ok ? undefined : t('arrival.valueInvalid')}
          />
          <Text className={`-mt-md text-start text-sm text-neutral-600 ${fontClass}`}>
            {t('items.valueHint')}
          </Text>

          {!isBuiltin && kind === 'player_kit' ? (
            <AuthTextField
              testID="item-code"
              label={t('items.codeLabel')}
              value={code}
              onChangeText={(text) =>
                setCode(
                  text
                    .toUpperCase()
                    .replace(/[^A-Z]/g, '')
                    .slice(0, 3),
                )
              }
              autoCapitalize="characters"
              maxLength={3}
            />
          ) : null}
          {!isBuiltin && kind === 'player_kit' ? (
            <Text className={`-mt-md text-start text-sm text-neutral-600 ${fontClass}`}>
              {t('items.codeHint')}
            </Text>
          ) : null}

          <Section title={t('items.activeLabel')} hint={t('items.activeHint')}>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t('items.activeLabel')}
              className="flex-row flex-wrap gap-sm"
            >
              {(['on', 'off'] as const).map((candidate) => (
                <ChoiceOption
                  key={candidate}
                  testID={`item-active-${candidate}`}
                  value={candidate}
                  label={t(`items.active.${candidate}`)}
                  selected={(candidate === 'on') === isActive}
                  onSelect={(choice) => setIsActive(choice === 'on')}
                  languageFontClass={fontClass}
                />
              ))}
            </View>
          </Section>

          {error === null || errorMessage === null ? null : (
            <FailureNotice code={error.code} message={errorMessage} />
          )}
          <PressableScale
            testID="item-save"
            accessibilityRole="button"
            accessibilityLabel={saveItem.isPending ? t('items.saving') : t('items.save')}
            onPress={save}
            isDisabled={!canSave}
            isBusy={saveItem.isPending}
            haptic="tapLight"
            style={continuousCorners}
            className={`min-h-recommended items-center justify-center rounded-md px-lg ${
              canSave ? 'bg-primary' : 'bg-neutral-300'
            }`}
          >
            <Text
              className={`text-center text-md font-bold ${canSave ? 'text-white' : 'text-neutral-700'} ${fontClass}`}
            >
              {saveItem.isPending ? t('items.saving') : t('items.save')}
            </Text>
          </PressableScale>
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
