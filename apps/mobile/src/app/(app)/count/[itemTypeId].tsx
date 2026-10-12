/**
 * Count one item on the shelf (RAPP-251). Two steps: a blind count, size by
 * size, so the app's own numbers cannot steer it; then the differences, with
 * a reason from a fixed list when there are any. Saving writes the
 * corrections and the audit entry, and answers the item's stock alerts.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FailureNotice } from '@/components/error-code-line';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useHandoverItemTypes } from '@/lib/handover';
import { isNetworkStateOnline } from '@/lib/network-status';
import { useRecordCount, useStockLevels } from '@/lib/stock';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { randomUUID } from 'expo-crypto';
import { useNetworkState } from 'expo-network';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  COUNT_REASONS,
  countDifferences,
  type CountLine,
  type CountReason,
} from '@ramassa/shared/equipment';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { tokens } from '@ramassa/shared/tokens';

type Step = 'count' | 'review';

/** A count typed by a person: digits only, or nothing yet. */
function readCount(text: string): number | null {
  return /^\d{1,6}$/.test(text.trim()) ? Number(text.trim()) : null;
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  busy = false,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled: boolean;
  readonly busy?: boolean;
  readonly testID: string;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      isDisabled={disabled}
      isBusy={busy}
      haptic="tapLight"
      style={continuousCorners}
      className={`min-h-recommended items-center justify-center rounded-md px-lg ${
        disabled ? 'bg-neutral-300' : 'bg-primary'
      }`}
    >
      <Text
        className={`text-center text-md font-bold ${disabled ? 'text-neutral-700' : 'text-white'} ${fontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export default function StockCountScreen() {
  const { itemTypeId = '' } = useLocalSearchParams<{ itemTypeId: string }>();
  const { back } = useRouter();
  const { t } = useTranslation('participants');
  const { t: tEquipment } = useTranslation('equipment');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const isOnline = isNetworkStateOnline(useNetworkState());
  const itemTypes = useHandoverItemTypes();
  const levels = useStockLevels();
  const recordCount = useRecordCount();
  const scrollRef = useRef<ScrollView>(null);

  const [countId] = useState(() => randomUUID());
  const [step, setStep] = useState<Step>('count');
  const [texts, setTexts] = useState<Readonly<Record<string, string>>>({});
  const [reason, setReason] = useState<CountReason | null>(null);
  const [note, setNote] = useState('');
  const [saveError, setSaveError] = useState<AppErrorCode | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  const itemType = (itemTypes.data ?? []).find((type) => type.id === itemTypeId) ?? null;
  // A sizeless item is one line, keyed by the empty string.
  const sizes: readonly (string | null)[] = useMemo(
    () => (itemType === null ? [] : itemType.sizes.length === 0 ? [null] : itemType.sizes),
    [itemType],
  );
  const lines: readonly CountLine[] | null = useMemo(() => {
    const read = sizes.map((size) => ({ size, counted: readCount(texts[size ?? ''] ?? '') }));
    return read.every((line) => line.counted !== null)
      ? read.map((line) => ({ size: line.size, counted: line.counted as number }))
      : null;
  }, [sizes, texts]);
  const expected = useMemo(
    () =>
      new Map(
        (levels.data ?? [])
          .filter((level) => level.itemKey === itemType?.key)
          .map((level) => [level.size, level.quantity] as const),
      ),
    [itemType?.key, levels.data],
  );
  const differences = lines === null ? [] : countDifferences(lines, expected);
  const needsReason = differences.length > 0;
  const item = itemType === null ? '' : tEquipment(itemType.key);

  const save = () => {
    if (lines === null || itemType === null || (needsReason && reason === null)) return;
    setSaveError(null);
    recordCount.mutate(
      {
        id: countId,
        itemTypeId: itemType.id,
        lines,
        reason: needsReason ? reason : null,
        note,
      },
      { onSuccess: () => back(), onError: (error) => setSaveError(toAppError(error).code) },
    );
  };

  if (itemTypes.isPending || levels.isPending) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-neutral-50">
        <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-3xl"
      >
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="count-back"
            accessibilityLabel={step === 'review' ? t('count.back') : tCommon('back')}
            onPress={step === 'review' ? () => setStep('count') : back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {step === 'review' ? t('count.back') : tCommon('back')}
            </Text>
          </PressableScale>
          <Text
            accessibilityRole="header"
            className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
          >
            {t('count.title', { item })}
          </Text>

          {step === 'count' ? (
            <>
              <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                {t('count.intro')}
              </Text>
              {sizes.map((size) => (
                <View
                  key={size ?? ''}
                  style={continuousCorners}
                  className="flex-row items-center justify-between gap-md rounded-md border border-neutral-200 bg-white px-md py-sm"
                >
                  <Text
                    className={`flex-1 text-start text-md font-semibold text-neutral-900 ${fontClass}`}
                  >
                    {size === null ? t('count.onShelf') : t('count.sizeLabel', { size })}
                  </Text>
                  <TextInput
                    testID={`count-input-${size ?? 'all'}`}
                    accessibilityLabel={
                      size === null ? t('count.onShelf') : t('count.sizeLabel', { size })
                    }
                    value={texts[size ?? ''] ?? ''}
                    onChangeText={(text) =>
                      setTexts((current) => ({ ...current, [size ?? '']: text.replace(/\D/g, '') }))
                    }
                    keyboardType="number-pad"
                    maxLength={6}
                    style={continuousCorners}
                    className={`min-h-recommended w-3xl rounded-md border border-neutral-300 bg-white text-center text-lg text-neutral-900 ${fontClass}`}
                  />
                </View>
              ))}
              <PrimaryButton
                testID="count-to-review"
                label={t('count.toReview')}
                onPress={() => setStep('review')}
                disabled={lines === null}
              />
            </>
          ) : (
            <>
              {needsReason ? (
                <View className="gap-sm" testID="count-differences">
                  <Text
                    accessibilityRole="header"
                    className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}
                  >
                    {t('count.differencesTitle')}
                  </Text>
                  {differences.map((difference) => (
                    <Text
                      key={difference.size ?? ''}
                      className={`text-start text-md text-neutral-800 ${fontClass}`}
                    >
                      {difference.size === null
                        ? t('count.differenceNoSize', { ...difference })
                        : t('count.difference', { ...difference })}
                    </Text>
                  ))}
                  <Text
                    className={`pt-sm text-start text-md font-semibold text-neutral-900 ${fontClass}`}
                  >
                    {t('count.reasonLabel')}
                  </Text>
                  <View
                    accessibilityRole="radiogroup"
                    accessibilityLabel={t('count.reasonLabel')}
                    className="flex-row flex-wrap gap-sm"
                  >
                    {COUNT_REASONS.map((candidate) => (
                      <ChoiceOption
                        key={candidate}
                        testID={`count-reason-${candidate}`}
                        value={candidate}
                        label={t(`count.reason.${candidate}`)}
                        selected={candidate === reason}
                        onSelect={setReason}
                        languageFontClass={fontClass}
                      />
                    ))}
                  </View>
                  <AuthTextField
                    testID="count-note"
                    label={t('count.noteLabel')}
                    value={note}
                    onChangeText={setNote}
                    maxLength={500}
                  />
                </View>
              ) : (
                <Text
                  testID="count-matches"
                  className={`text-start text-md text-neutral-800 ${fontClass}`}
                >
                  {t('count.matches')}
                </Text>
              )}
              {saveError === null ? null : (
                <FailureNotice code={saveError} message={t('count.saveFailed')} />
              )}
              {!isOnline ? (
                <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                  {t('count.needsConnection')}
                </Text>
              ) : needsReason && reason === null ? (
                <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                  {t('count.reasonRequired')}
                </Text>
              ) : null}
              <PrimaryButton
                testID="count-save"
                label={recordCount.isPending ? t('count.saving') : t('count.save')}
                onPress={save}
                disabled={!isOnline || (needsReason && reason === null)}
                busy={recordCount.isPending}
              />
            </>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
