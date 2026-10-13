/**
 * Goods received (RAPP-250): where the goods came from, the items with sizes,
 * quantities and values, problems noted, and photos of the goods and of the
 * delivery note or receipt. Photos upload as they are taken. Saving needs a
 * connection; the arrival's id is made once, so a second press after a lost
 * answer saves nothing twice.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FailureNotice } from '@/components/error-code-line';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import {
  addArrivalLine,
  arrivalBlocker,
  clampQuantity,
  prefilledValue,
  readValue,
  type ArrivalDraftLine,
} from '@/lib/arrival-form';
import { continuousCorners } from '@/lib/continuous-corners';
import { useHandoverItemTypes } from '@/lib/handover';
import { useItemLabel } from '@/lib/item-label';
import { isNetworkStateOnline } from '@/lib/network-status';
import { uploadArrivalPhoto, useRecordArrival } from '@/lib/stock';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { randomUUID } from 'expo-crypto';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useNetworkState } from 'expo-network';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import {
  ARRIVAL_MAX_PHOTOS,
  ARRIVAL_PHOTO_KINDS,
  ARRIVAL_SOURCES,
  type ArrivalPhotoKind,
  type ArrivalSource,
} from '@ramassa/shared/equipment';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const photoStyle = { width: 96, height: 96, borderRadius: tokens.radius.md } as const;
const IMAGE_PICKER_ORIGINAL_QUALITY = 1;

interface PhotoDraft {
  readonly key: string;
  readonly kind: ArrivalPhotoKind;
  readonly uri: string;
  readonly objectKey: string | null;
  readonly failed: boolean;
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const fontClass = useLanguageFontClass();
  return (
    <View className="gap-sm">
      <Text
        accessibilityRole="header"
        className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function OutlineButton({
  label,
  accessibilityLabel,
  onPress,
  testID,
  disabled = false,
}: {
  readonly label: string;
  /** When the visible label is a sign, the words a screen reader says. */
  readonly accessibilityLabel?: string;
  readonly onPress: () => void;
  readonly testID: string;
  readonly disabled?: boolean;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      isDisabled={disabled}
      haptic="tapLight"
      style={continuousCorners}
      className={`min-h-recommended items-center justify-center rounded-md border px-md ${
        disabled ? 'border-neutral-300' : 'border-primary'
      }`}
    >
      <Text
        className={`text-center font-bold ${disabled ? 'text-neutral-500' : 'text-primary-dark'} ${fontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export default function NewArrivalScreen() {
  const { t, i18n } = useTranslation('participants');
  const itemLabel = useItemLabel();
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const accessToken = useAuth().session?.access_token;
  const isOnline = isNetworkStateOnline(useNetworkState());
  const itemTypes = useHandoverItemTypes();
  const recordArrival = useRecordArrival();
  const locale = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;

  const [arrivalId] = useState(() => randomUUID());
  const [source, setSource] = useState<ArrivalSource>('donation');
  const [sourceName, setSourceName] = useState('');
  const [lines, setLines] = useState<readonly ArrivalDraftLine[]>([]);
  const [itemTypeId, setItemTypeId] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [valueText, setValueText] = useState('');
  const [problems, setProblems] = useState('');
  const [totalCostText, setTotalCostText] = useState('');
  const [photos, setPhotos] = useState<readonly PhotoDraft[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<AppErrorCode | null>(null);

  const types = useMemo(
    () =>
      // Switched-off items leave the pickers (RAPP-253).
      (itemTypes.data ?? [])
        .filter((type) => type.is_active)
        .sort((left, right) => itemLabel(left.key).localeCompare(itemLabel(right.key), locale)),
    [itemTypes.data, locale, itemLabel],
  );
  const itemType = types.find((candidate) => candidate.id === itemTypeId) ?? null;
  const needsSize = itemType !== null && itemType.sizes.length > 0;
  const value = readValue(valueText);
  const canAddLine = itemType !== null && (!needsSize || size !== null) && value.ok;
  const uploading = photos.filter((photo) => photo.objectKey === null && !photo.failed).length;
  const blocker = arrivalBlocker({
    isOnline,
    lineCount: lines.length,
    uploadingPhotos: uploading,
    totalCostText,
  });
  const euro = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }),
    [locale],
  );

  const chooseItem = useCallback(
    (id: string) => {
      setItemTypeId(id);
      setSize(null);
      setQuantity(1);
      const chosen = types.find((candidate) => candidate.id === id);
      setValueText(prefilledValue(source, chosen?.default_value_cents ?? null));
    },
    [source, types],
  );
  const chooseSource = useCallback(
    (next: ArrivalSource) => {
      setSource(next);
      if (itemType !== null) setValueText(prefilledValue(next, itemType.default_value_cents));
    },
    [itemType],
  );
  const addLine = useCallback(() => {
    if (itemType === null || !canAddLine) return;
    setLines((current) =>
      addArrivalLine(current, {
        itemTypeId: itemType.id,
        itemKey: itemType.key,
        size: needsSize ? size : null,
        quantity,
        unitValueCents: value.cents,
      }),
    );
    setItemTypeId(null);
    setSize(null);
    setQuantity(1);
    setValueText('');
  }, [canAddLine, itemType, needsSize, quantity, size, value.cents]);

  const addPhoto = useCallback(
    async (kind: ArrivalPhotoKind, from: 'camera' | 'library') => {
      setPhotoError(null);
      if (accessToken === undefined) return;
      if (from === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setPhotoError(t('arrival.cameraDenied'));
          return;
        }
      }
      const options = { mediaTypes: ['images' as const], quality: IMAGE_PICKER_ORIGINAL_QUALITY };
      const result =
        from === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? undefined : result.assets[0];
      if (asset === undefined) return;
      const key = randomUUID();
      setPhotos((current) => [
        ...current,
        { key, kind, uri: asset.uri, objectKey: null, failed: false },
      ]);
      try {
        const objectKey = await uploadArrivalPhoto(
          { uri: asset.uri, width: asset.width, height: asset.height },
          accessToken,
        );
        setPhotos((current) =>
          current.map((photo) => (photo.key === key ? { ...photo, objectKey } : photo)),
        );
      } catch {
        setPhotos((current) =>
          current.map((photo) => (photo.key === key ? { ...photo, failed: true } : photo)),
        );
        setPhotoError(t('arrival.photoFailed'));
      }
    },
    [accessToken, t],
  );

  const save = useCallback(() => {
    if (blocker !== null || recordArrival.isPending) return;
    setSaveError(null);
    recordArrival.mutate(
      {
        id: arrivalId,
        receivedAt: new Date().toISOString(),
        source,
        sourceName,
        problems,
        totalCostCents: source === 'purchase' ? readValue(totalCostText).cents : null,
        lines: lines.map((line) => ({
          itemTypeId: line.itemTypeId,
          size: line.size,
          quantity: line.quantity,
          unitValueCents: line.unitValueCents,
        })),
        photos: photos.flatMap((photo) =>
          photo.objectKey === null ? [] : [{ objectKey: photo.objectKey, kind: photo.kind }],
        ),
      },
      {
        onSuccess: () => back(),
        onError: (error) => setSaveError(toAppError(error).code),
      },
    );
  }, [
    arrivalId,
    back,
    blocker,
    lines,
    photos,
    problems,
    recordArrival,
    source,
    sourceName,
    totalCostText,
  ]);

  const blockerText =
    blocker === 'offline'
      ? t('arrival.needsConnection')
      : blocker === 'no-lines'
        ? t('arrival.noLines')
        : blocker === 'uploading'
          ? t('arrival.uploading')
          : blocker === 'bad-total'
            ? t('arrival.valueInvalid')
            : null;

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
            testID="arrival-back"
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
            {t('arrival.title')}
          </Text>

          <Section title={t('arrival.sourceLabel')}>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t('arrival.sourceLabel')}
              className="flex-row flex-wrap gap-sm"
            >
              {ARRIVAL_SOURCES.map((candidate) => (
                <ChoiceOption
                  key={candidate}
                  testID={`arrival-source-${candidate}`}
                  value={candidate}
                  label={t(`stock.source.${candidate}`)}
                  selected={candidate === source}
                  onSelect={chooseSource}
                  languageFontClass={fontClass}
                />
              ))}
            </View>
            <AuthTextField
              testID="arrival-source-name"
              label={t(`arrival.sourceName.${source}`)}
              value={sourceName}
              onChangeText={setSourceName}
              maxLength={200}
            />
          </Section>

          <Section title={t('arrival.linesLabel')}>
            {lines.map((line, index) => {
              const item =
                line.size === null
                  ? itemLabel(line.itemKey)
                  : `${itemLabel(line.itemKey)} ${line.size}`;
              return (
                <View
                  key={`${line.itemTypeId}-${line.size ?? ''}-${line.unitValueCents ?? ''}`}
                  testID={`arrival-line-${index}`}
                  style={continuousCorners}
                  className="flex-row items-center justify-between gap-sm rounded-md border border-neutral-200 bg-white px-md py-sm"
                >
                  <View className="flex-1 gap-xs">
                    <Text
                      className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}
                    >
                      {t('arrival.lineSummary', { item, quantity: line.quantity })}
                    </Text>
                    {line.unitValueCents === null ? null : (
                      <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
                        {t('arrival.lineValue', { value: euro.format(line.unitValueCents / 100) })}
                      </Text>
                    )}
                  </View>
                  <PressableScale
                    testID={`arrival-line-remove-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={t('arrival.removeLine', { item })}
                    onPress={() => setLines((current) => current.filter((_, at) => at !== index))}
                    haptic="tapLight"
                    className="min-h-recommended min-w-recommended items-center justify-center"
                  >
                    <Text className={`font-semibold text-primary-dark ${fontClass}`}>
                      {t('arrival.remove')}
                    </Text>
                  </PressableScale>
                </View>
              );
            })}

            <View
              style={continuousCorners}
              className="gap-md rounded-md border border-neutral-200 bg-white p-md"
            >
              <Text className={`text-start text-md font-semibold text-neutral-800 ${fontClass}`}>
                {t('arrival.itemLabel')}
              </Text>
              {itemTypes.isPending ? (
                <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
              ) : null}
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel={t('arrival.itemLabel')}
                className="flex-row flex-wrap gap-sm"
              >
                {types.map((type) => (
                  <ChoiceOption
                    key={type.id}
                    testID={`arrival-item-${type.key}`}
                    value={type.id}
                    label={itemLabel(type.key)}
                    selected={type.id === itemTypeId}
                    onSelect={chooseItem}
                    languageFontClass={fontClass}
                  />
                ))}
              </View>
              {needsSize ? (
                <>
                  <Text
                    className={`text-start text-md font-semibold text-neutral-800 ${fontClass}`}
                  >
                    {t('arrival.sizeLabel')}
                  </Text>
                  <View
                    accessibilityRole="radiogroup"
                    accessibilityLabel={t('arrival.sizeLabel')}
                    className="flex-row flex-wrap gap-sm"
                  >
                    {itemType.sizes.map((candidate) => (
                      <ChoiceOption
                        key={candidate}
                        testID={`arrival-size-${candidate}`}
                        value={candidate}
                        label={candidate}
                        selected={candidate === size}
                        onSelect={setSize}
                        languageFontClass={fontClass}
                      />
                    ))}
                  </View>
                </>
              ) : null}
              {itemType === null ? null : (
                <>
                  <Text
                    className={`text-start text-md font-semibold text-neutral-800 ${fontClass}`}
                  >
                    {t('arrival.quantityLabel')}
                  </Text>
                  <View className="flex-row items-center gap-sm">
                    <OutlineButton
                      testID="arrival-quantity-less"
                      label="−"
                      accessibilityLabel={t('arrival.less')}
                      onPress={() => setQuantity((current) => clampQuantity(current - 1))}
                      disabled={quantity <= 1}
                    />
                    <TextInput
                      testID="arrival-quantity"
                      accessibilityLabel={t('arrival.quantityLabel')}
                      value={String(quantity)}
                      onChangeText={(text) =>
                        setQuantity(clampQuantity(Number(text.replace(/\D/g, '')) || 1))
                      }
                      keyboardType="number-pad"
                      selectTextOnFocus
                      style={continuousCorners}
                      className={`min-h-recommended w-3xl rounded-md border border-neutral-300 bg-white text-center text-lg text-neutral-900 ${fontClass}`}
                    />
                    <OutlineButton
                      testID="arrival-quantity-more"
                      label="+"
                      accessibilityLabel={t('arrival.more')}
                      onPress={() => setQuantity((current) => clampQuantity(current + 1))}
                    />
                  </View>
                  <AuthTextField
                    testID="arrival-value"
                    label={t(`arrival.valueLabel.${source}`)}
                    value={valueText}
                    onChangeText={setValueText}
                    keyboardType="decimal-pad"
                    errorMessage={value.ok ? undefined : t('arrival.valueInvalid')}
                  />
                  {source === 'purchase' || itemType.default_value_cents === null ? null : (
                    <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                      {t('arrival.valueHint')}
                    </Text>
                  )}
                </>
              )}
              <OutlineButton
                testID="arrival-add-line"
                label={t('arrival.addLine')}
                onPress={addLine}
                disabled={!canAddLine}
              />
            </View>
          </Section>

          {source === 'purchase' ? (
            <AuthTextField
              testID="arrival-total-cost"
              label={t('arrival.totalCostLabel')}
              value={totalCostText}
              onChangeText={setTotalCostText}
              keyboardType="decimal-pad"
              errorMessage={readValue(totalCostText).ok ? undefined : t('arrival.valueInvalid')}
            />
          ) : null}

          <AuthTextField
            testID="arrival-problems"
            label={t('arrival.problemsLabel')}
            value={problems}
            onChangeText={setProblems}
            maxLength={1000}
            multiline
            textAlignVertical="top"
          />

          <Section title={t('arrival.photosLabel')}>
            <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
              {t('arrival.photosHint')}
            </Text>
            {photos.length === 0 ? null : (
              <View className="flex-row flex-wrap gap-sm">
                {photos.map((photo) => (
                  <View key={photo.key} className="items-start gap-xs">
                    <Image
                      source={{ uri: photo.uri }}
                      style={photoStyle}
                      contentFit="cover"
                      accessibilityLabel={t(`stock.photo.${photo.kind}`)}
                    />
                    {photo.objectKey === null && !photo.failed ? (
                      <ActivityIndicator
                        accessibilityLabel={t('arrival.uploading')}
                        color={tokens.colors.primary.DEFAULT}
                      />
                    ) : (
                      <PressableScale
                        testID={`arrival-photo-remove-${photo.key}`}
                        accessibilityRole="button"
                        accessibilityLabel={t('arrival.removePhoto')}
                        onPress={() =>
                          setPhotos((current) =>
                            current.filter((candidate) => candidate.key !== photo.key),
                          )
                        }
                        haptic="tapLight"
                        className="min-h-recommended justify-center"
                      >
                        <Text className={`text-sm font-semibold text-primary-dark ${fontClass}`}>
                          {t('arrival.removePhoto')}
                        </Text>
                      </PressableScale>
                    )}
                  </View>
                ))}
              </View>
            )}
            {photos.length >= ARRIVAL_MAX_PHOTOS ? null : (
              <View className="gap-sm">
                {ARRIVAL_PHOTO_KINDS.map((kind) => (
                  <OutlineButton
                    key={kind}
                    testID={`arrival-take-${kind}`}
                    label={t(`arrival.takePhoto.${kind}`)}
                    onPress={() => void addPhoto(kind, 'camera')}
                  />
                ))}
                <OutlineButton
                  testID="arrival-choose-photo"
                  label={t('arrival.choosePhoto')}
                  onPress={() => void addPhoto('goods', 'library')}
                />
              </View>
            )}
            {photoError === null ? null : (
              <Text
                accessibilityRole="alert"
                className={`text-start text-sm text-error ${fontClass}`}
              >
                {photoError}
              </Text>
            )}
          </Section>

          {saveError === null ? null : (
            <FailureNotice code={saveError} message={t('arrival.saveFailed')} />
          )}
          {blockerText === null ? null : (
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {blockerText}
            </Text>
          )}
          <PressableScale
            testID="arrival-save"
            accessibilityRole="button"
            accessibilityLabel={recordArrival.isPending ? t('arrival.saving') : t('arrival.save')}
            onPress={save}
            isDisabled={blocker !== null}
            isBusy={recordArrival.isPending}
            haptic="tapLight"
            style={continuousCorners}
            className={`min-h-recommended items-center justify-center rounded-md px-lg ${
              blocker === null ? 'bg-primary' : 'bg-neutral-300'
            }`}
          >
            <Text
              className={`text-center text-md font-bold ${blocker === null ? 'text-white' : 'text-neutral-700'} ${fontClass}`}
            >
              {recordArrival.isPending ? t('arrival.saving') : t('arrival.save')}
            </Text>
          </PressableScale>
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
