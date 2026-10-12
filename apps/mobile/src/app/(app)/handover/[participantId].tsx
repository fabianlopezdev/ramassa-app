/**
 * Hand over material at the pitch (RAPP-249). Two steps on one screen: the
 * item, size and given-or-lent; then the statement in her language with her
 * signature, or the reason she does not sign. Saving puts the handover in the
 * offline outbox and sends it at once when there is signal, so the screen
 * works the same without one. The record is final once saved.
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { SignaturePad } from '@/components/equipment/signature-pad';
import { FailureNotice } from '@/components/error-code-line';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useHandoverItemTypes, useHandoverOutbox, type HandoverOutcome } from '@/lib/handover';
import { handoverSignature, statementLanguageFor, suggestedSize } from '@/lib/handover-form';
import { fontClassForLanguage } from '@/lib/language-font-class';
import { useParticipantCard } from '@/lib/participant-lookup';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  HANDOVER_MODES,
  STATEMENT_LANGUAGES,
  UNSIGNED_STATES,
  type HandoverMode,
  type SignatureStrokes,
  type StatementLanguage,
  type UnsignedState,
} from '@ramassa/shared/equipment';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { isRtlLanguage, LANGUAGE_NATIVE_NAMES } from '@ramassa/shared/i18n';

type Step = 'item' | 'signature' | 'done';

// Her statement runs in her script's direction, whatever the staff app's is.
const rtlText = { writingDirection: 'rtl' } as const;
const ltrText = { writingDirection: 'ltr' } as const;

function SectionLabel({
  children,
  fontClass,
}: {
  readonly children: string;
  readonly fontClass: string;
}) {
  return (
    <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>{children}</Text>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  testID,
  fontClass,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly testID: string;
  readonly fontClass: string;
}) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      isDisabled={disabled}
      isBusy={busy}
      onPress={onPress}
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

function SecondaryButton({
  label,
  onPress,
  testID,
  fontClass,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
  readonly fontClass: string;
}) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      haptic="tapLight"
      className="min-h-recommended items-center justify-center px-lg"
    >
      <Text className={`text-center text-md font-semibold text-primary-dark ${fontClass}`}>
        {label}
      </Text>
    </PressableScale>
  );
}

export default function HandoverScreen() {
  const { participantId = '' } = useLocalSearchParams<{ participantId: string }>();
  const { back } = useRouter();
  const { t, i18n } = useTranslation('participants');
  const { t: tEquipment } = useTranslation('equipment');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const her = useParticipantCard(participantId).data ?? null;
  const itemTypes = useHandoverItemTypes();
  const { record } = useHandoverOutbox();

  const [step, setStep] = useState<Step>('item');
  const [itemTypeId, setItemTypeId] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [mode, setMode] = useState<HandoverMode>('given');
  const [language, setLanguage] = useState<StatementLanguage | null>(null);
  const [strokes, setStrokes] = useState<SignatureStrokes | null>(null);
  const [unsigned, setUnsigned] = useState<UnsignedState | null>(null);
  const [reason, setReason] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const [outcome, setOutcome] = useState<HandoverOutcome | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  // Each step starts at its top, so its heading and Back are in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  // In the reader's language order, so the list reads alphabetically.
  const types = useMemo(
    () =>
      [...(itemTypes.data ?? [])].sort((left, right) =>
        tEquipment(left.key).localeCompare(tEquipment(right.key), i18n.resolvedLanguage),
      ),
    [i18n.resolvedLanguage, itemTypes.data, tEquipment],
  );
  const itemType = types.find((candidate) => candidate.id === itemTypeId) ?? null;
  const needsSize = itemType !== null && itemType.sizes.length > 0;
  const isItemReady = itemType !== null && (!needsSize || size !== null);
  const statementLanguage = language ?? statementLanguageFor(her?.preferred_language ?? null);
  const signature = handoverSignature({ strokes, unsigned, reason });
  const name = her === null ? '' : `${her.first_name} ${her.last_name}`;

  // Her statement, in her language, whatever language the staff app is in.
  const statement = useMemo(() => {
    if (itemType === null) return '';
    const fixed = i18n.getFixedT(statementLanguage, 'equipment');
    const item = fixed(itemType.key);
    const itemWithSize = size === null ? item : fixed('statementItemSize', { item, size });
    return fixed(mode === 'given' ? 'statementGiven' : 'statementLent', { item: itemWithSize });
  }, [i18n, itemType, mode, size, statementLanguage]);
  const signHere = useMemo(
    () => i18n.getFixedT(statementLanguage, 'equipment')('signHere'),
    [i18n, statementLanguage],
  );
  const statementFont = fontClassForLanguage(statementLanguage);
  const statementDirection = isRtlLanguage(statementLanguage) ? rtlText : ltrText;

  const chooseItem = useCallback(
    (id: string) => {
      setItemTypeId(id);
      const chosen = types.find((candidate) => candidate.id === id);
      setSize(
        chosen === undefined
          ? null
          : suggestedSize(chosen.key, chosen.sizes, {
              clothingSize: her?.clothing_size ?? null,
              shoeSize: her?.shoe_size ?? null,
            }),
      );
    },
    [her, types],
  );
  const chooseUnsigned = useCallback((value: UnsignedState) => {
    setUnsigned((current) => (current === value ? null : value));
    setStrokes(null);
  }, []);

  const reset = useCallback(() => {
    setStep('item');
    setItemTypeId(null);
    setSize(null);
    setMode('given');
    setStrokes(null);
    setUnsigned(null);
    setReason('');
    setOutcome(null);
    setErrorCode(null);
  }, []);

  const save = useCallback(async () => {
    if (itemType === null || signature === null || isSaving) return;
    setIsSaving(true);
    setErrorCode(null);
    try {
      const result = await record({
        id: randomUUID(),
        handedOverAt: new Date().toISOString(),
        participantId,
        itemTypeId: itemType.id,
        itemKey: itemType.key,
        size: needsSize ? size : null,
        mode,
        signature,
        statementLanguage,
      });
      setOutcome(result);
      setStep('done');
    } catch (error) {
      setErrorCode(toAppError(error).code);
    } finally {
      setIsSaving(false);
    }
  }, [
    isSaving,
    itemType,
    mode,
    needsSize,
    participantId,
    record,
    signature,
    size,
    statementLanguage,
  ]);

  if (itemTypes.isPending)
    return <AnnouncementFeedSkeleton accessibilityLabel={t('material.handoverTitle')} />;

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView
        ref={scrollRef}
        scrollEnabled={!isDrawing}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-3xl"
      >
        <PageWidth className="gap-lg p-lg">
          {step === 'done' ? null : (
            <PressableScale
              testID="handover-back"
              accessibilityLabel={step === 'signature' ? t('material.back') : tCommon('back')}
              onPress={step === 'signature' ? () => setStep('item') : back}
              haptic="tapLight"
              className="min-h-recommended self-start justify-center"
            >
              <Text className={`font-semibold text-primary-dark ${fontClass}`}>
                {step === 'signature' ? t('material.back') : tCommon('back')}
              </Text>
            </PressableScale>
          )}
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
            >
              {step === 'done' ? t('material.savedTitle') : t('material.handoverTitle')}
            </Text>
            {name.length > 0 ? (
              <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                {t('material.handoverFor', { name })}
              </Text>
            ) : null}
          </View>

          {step === 'item' ? (
            <>
              <View className="gap-sm">
                <SectionLabel fontClass={fontClass}>{t('material.itemLabel')}</SectionLabel>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t('material.itemLabel')}
                  className="flex-row flex-wrap gap-sm"
                >
                  {types.map((type) => (
                    <ChoiceOption
                      key={type.id}
                      testID={`handover-item-${type.key}`}
                      value={type.id}
                      label={tEquipment(type.key)}
                      selected={type.id === itemTypeId}
                      onSelect={chooseItem}
                      languageFontClass={fontClass}
                    />
                  ))}
                </View>
              </View>
              {needsSize ? (
                <View className="gap-sm">
                  <SectionLabel fontClass={fontClass}>{t('material.sizeLabel')}</SectionLabel>
                  <View
                    accessibilityRole="radiogroup"
                    accessibilityLabel={t('material.sizeLabel')}
                    className="flex-row flex-wrap gap-sm"
                  >
                    {itemType.sizes.map((candidate) => (
                      <ChoiceOption
                        key={candidate}
                        testID={`handover-size-${candidate}`}
                        value={candidate}
                        label={candidate}
                        selected={candidate === size}
                        onSelect={setSize}
                        languageFontClass={fontClass}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
              <View className="gap-sm">
                <SectionLabel fontClass={fontClass}>{t('material.modeLabel')}</SectionLabel>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t('material.modeLabel')}
                  className="flex-row flex-wrap gap-sm"
                >
                  {HANDOVER_MODES.map((candidate) => (
                    <ChoiceOption
                      key={candidate}
                      testID={`handover-mode-${candidate}`}
                      value={candidate}
                      label={t(`material.mode.${candidate}`)}
                      selected={candidate === mode}
                      onSelect={setMode}
                      languageFontClass={fontClass}
                    />
                  ))}
                </View>
              </View>
              {isItemReady ? null : (
                <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                  {t('material.chooseItem')}
                </Text>
              )}
              <PrimaryButton
                testID="handover-to-signature"
                label={t('material.toSignature')}
                onPress={() => setStep('signature')}
                disabled={!isItemReady}
                fontClass={fontClass}
              />
            </>
          ) : null}

          {step === 'signature' ? (
            <>
              <View className="gap-sm">
                <SectionLabel fontClass={fontClass}>
                  {t('material.statementLanguageLabel')}
                </SectionLabel>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t('material.statementLanguageLabel')}
                  className="flex-row flex-wrap gap-sm"
                >
                  {STATEMENT_LANGUAGES.map((candidate) => (
                    <ChoiceOption
                      key={candidate}
                      testID={`handover-language-${candidate}`}
                      value={candidate}
                      label={LANGUAGE_NATIVE_NAMES[candidate]}
                      selected={candidate === statementLanguage}
                      onSelect={setLanguage}
                      languageFontClass={fontClassForLanguage(candidate)}
                    />
                  ))}
                </View>
              </View>
              <View
                style={continuousCorners}
                className="rounded-md border border-neutral-200 bg-white p-md"
              >
                <Text
                  testID="handover-statement"
                  style={statementDirection}
                  className={`text-start text-lg text-neutral-900 ${statementFont}`}
                >
                  {statement}
                </Text>
              </View>
              {unsigned === null ? (
                <View className="gap-sm">
                  {/* A fixed height, so Clear appearing does not move the pad under her finger. */}
                  <View className="min-h-recommended flex-row items-center justify-between">
                    <SectionLabel fontClass={fontClass}>
                      {t('material.signatureLabel')}
                    </SectionLabel>
                    {strokes === null ? null : (
                      <SecondaryButton
                        testID="handover-clear-signature"
                        label={t('material.clearSignature')}
                        onPress={() => setStrokes(null)}
                        fontClass={fontClass}
                      />
                    )}
                  </View>
                  <SignaturePad
                    strokes={strokes}
                    onChange={setStrokes}
                    onDrawingChange={setIsDrawing}
                    prompt={signHere}
                    promptClassName={statementFont}
                    accessibilityLabel={t('material.signatureLabel')}
                  />
                  <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                    {t('material.signatureHint')}
                  </Text>
                </View>
              ) : null}
              <View className="gap-sm">
                <SectionLabel fontClass={fontClass}>{t('material.doesNotSign')}</SectionLabel>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t('material.doesNotSign')}
                  className="flex-row flex-wrap gap-sm"
                >
                  {UNSIGNED_STATES.map((candidate) => (
                    <ChoiceOption
                      key={candidate}
                      testID={`handover-unsigned-${candidate}`}
                      value={candidate}
                      label={t(`material.unsigned.${candidate}`)}
                      selected={candidate === unsigned}
                      onSelect={chooseUnsigned}
                      languageFontClass={fontClass}
                    />
                  ))}
                </View>
                {unsigned === null ? null : (
                  <AuthTextField
                    testID="handover-reason"
                    label={t('material.reasonLabel')}
                    value={reason}
                    onChangeText={setReason}
                    maxLength={500}
                  />
                )}
              </View>
              {errorCode === null ? null : (
                <FailureNotice code={errorCode} message={t('material.saveFailed')} />
              )}
              {signature === null ? (
                <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                  {t('material.signatureRequired')}
                </Text>
              ) : null}
              <PrimaryButton
                testID="handover-save"
                label={isSaving ? t('material.saving') : t('material.save')}
                onPress={() => void save()}
                disabled={signature === null}
                busy={isSaving}
                fontClass={fontClass}
              />
            </>
          ) : null}

          {step === 'done' && outcome !== null ? (
            <View className="gap-md">
              <Text
                testID="handover-saved"
                accessibilityRole="alert"
                className={`text-start text-md text-neutral-800 ${fontClass}`}
              >
                {outcome.state === 'waiting'
                  ? t('material.savedOffline')
                  : outcome.result.unitCode === null
                    ? t('material.savedTitle')
                    : t('material.savedUnitCode', { code: outcome.result.unitCode })}
              </Text>
              {outcome.state === 'saved' && outcome.result.stockAfter < 0 ? (
                <Text className={`text-start text-md text-neutral-800 ${fontClass}`}>
                  {t('material.savedBelowZero')}
                </Text>
              ) : null}
              <PrimaryButton
                testID="handover-done"
                label={t('material.done')}
                onPress={back}
                fontClass={fontClass}
              />
              <SecondaryButton
                testID="handover-another"
                label={t('material.another')}
                onPress={reset}
                fontClass={fontClass}
              />
            </View>
          ) : null}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
