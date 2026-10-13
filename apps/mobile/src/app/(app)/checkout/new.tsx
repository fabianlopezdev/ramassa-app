/**
 * Check material out to a staff member (RAPP-252): for a trip or an event,
 * never for a normal session. The item, size and quantity, who takes it, and
 * when it comes back. The checkout's id is made once, so a second press after
 * a lost answer saves nothing twice.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FailureNotice } from '@/components/error-code-line';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { clampQuantity } from '@/lib/arrival-form';
import { continuousCorners } from '@/lib/continuous-corners';
import { useHandoverItemTypes } from '@/lib/handover';
import { useItemLabel } from '@/lib/item-label';
import { isNetworkStateOnline } from '@/lib/network-status';
import { useCheckoutRecipients, useRecordCheckout } from '@/lib/stock';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { randomUUID } from 'expo-crypto';
import { useNetworkState } from 'expo-network';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RETURN_IN_DAYS, returnDateIn } from '@ramassa/shared/equipment';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';

function Group({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  const fontClass = useLanguageFontClass();
  return (
    <View className="gap-sm">
      <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>{label}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        className="flex-row flex-wrap gap-sm"
      >
        {children}
      </View>
    </View>
  );
}

function StepButton({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  testID,
}: {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly testID: string;
}) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      isDisabled={disabled}
      haptic="tapLight"
      style={continuousCorners}
      className={`min-h-recommended min-w-recommended items-center justify-center rounded-md border ${
        disabled ? 'border-neutral-300' : 'border-primary'
      }`}
    >
      <Text className={`text-lg font-bold ${disabled ? 'text-neutral-500' : 'text-primary-dark'}`}>
        {label}
      </Text>
    </PressableScale>
  );
}

export default function NewCheckoutScreen() {
  const { t, i18n } = useTranslation('participants');
  const itemLabel = useItemLabel();
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const isOnline = isNetworkStateOnline(useNetworkState());
  const itemTypes = useHandoverItemTypes();
  const recipients = useCheckoutRecipients();
  const recordCheckout = useRecordCheckout();
  const locale = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;

  const [checkoutId] = useState(() => randomUUID());
  const [itemTypeId, setItemTypeId] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [returnIn, setReturnIn] = useState<string>(String(RETURN_IN_DAYS[1]));
  const [note, setNote] = useState('');
  const [saveError, setSaveError] = useState<AppErrorCode | null>(null);

  const types = useMemo(
    () =>
      // Switched-off items leave the pickers (RAPP-253).
      (itemTypes.data ?? [])
        .filter((type) => type.is_active)
        .sort((left, right) => itemLabel(left.key).localeCompare(itemLabel(right.key), locale)),
    [itemTypes.data, locale, itemLabel],
  );
  const itemType = types.find((type) => type.id === itemTypeId) ?? null;
  const needsSize = itemType !== null && itemType.sizes.length > 0;
  const expectedReturnOn = returnDateIn(Number(returnIn));
  const dateText = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: MADRID_TIME_ZONE,
  }).format(new Date(`${expectedReturnOn}T12:00:00Z`));
  const isReady = itemType !== null && (!needsSize || size !== null) && staffId !== null;

  const save = () => {
    if (!isReady || !isOnline || itemType === null || staffId === null) return;
    setSaveError(null);
    recordCheckout.mutate(
      {
        id: checkoutId,
        itemTypeId: itemType.id,
        size: needsSize ? size : null,
        quantity,
        staffId,
        expectedReturnOn,
        note,
      },
      { onSuccess: () => back(), onError: (error) => setSaveError(toAppError(error).code) },
    );
  };

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
            testID="checkout-back"
            accessibilityLabel={tCommon('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {tCommon('back')}
            </Text>
          </PressableScale>
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('checkout.title')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('checkout.intro')}
            </Text>
          </View>

          <Group label={t('arrival.itemLabel')}>
            {types.map((type) => (
              <ChoiceOption
                key={type.id}
                testID={`checkout-item-${type.key}`}
                value={type.id}
                label={itemLabel(type.key)}
                selected={type.id === itemTypeId}
                onSelect={(id) => {
                  setItemTypeId(id);
                  setSize(null);
                }}
                languageFontClass={fontClass}
              />
            ))}
          </Group>
          {needsSize ? (
            <Group label={t('arrival.sizeLabel')}>
              {itemType.sizes.map((candidate) => (
                <ChoiceOption
                  key={candidate}
                  testID={`checkout-size-${candidate}`}
                  value={candidate}
                  label={candidate}
                  selected={candidate === size}
                  onSelect={setSize}
                  languageFontClass={fontClass}
                />
              ))}
            </Group>
          ) : null}

          <View className="gap-sm">
            <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>
              {t('arrival.quantityLabel')}
            </Text>
            <View className="flex-row items-center gap-sm">
              <StepButton
                testID="checkout-quantity-less"
                label="−"
                accessibilityLabel={t('arrival.less')}
                onPress={() => setQuantity((current) => clampQuantity(current - 1))}
                disabled={quantity <= 1}
              />
              <TextInput
                testID="checkout-quantity"
                accessibilityLabel={t('arrival.quantityLabel')}
                value={String(quantity)}
                onChangeText={(text) =>
                  setQuantity(Math.min(1000, clampQuantity(Number(text.replace(/\D/g, '')) || 1)))
                }
                keyboardType="number-pad"
                selectTextOnFocus
                style={continuousCorners}
                className={`min-h-recommended w-3xl rounded-md border border-neutral-300 bg-white text-center text-lg text-neutral-900 ${fontClass}`}
              />
              <StepButton
                testID="checkout-quantity-more"
                label="+"
                accessibilityLabel={t('arrival.more')}
                onPress={() => setQuantity((current) => Math.min(1000, current + 1))}
              />
            </View>
          </View>

          <Group label={t('checkout.staffLabel')}>
            {(recipients.data ?? []).map((person) => (
              <ChoiceOption
                key={person.id}
                testID={`checkout-staff-${person.id}`}
                value={person.id}
                label={person.name}
                selected={person.id === staffId}
                onSelect={setStaffId}
                languageFontClass={fontClass}
              />
            ))}
          </Group>

          <View className="gap-sm">
            <Group label={t('checkout.returnLabel')}>
              {RETURN_IN_DAYS.map((days) => (
                <ChoiceOption
                  key={days}
                  testID={`checkout-return-${days}`}
                  value={String(days)}
                  label={t(`checkout.returnIn.d${days}`)}
                  selected={String(days) === returnIn}
                  onSelect={setReturnIn}
                  languageFontClass={fontClass}
                />
              ))}
            </Group>
            <Text
              testID="checkout-return-date"
              className={`text-start text-md text-neutral-700 ${fontClass}`}
            >
              {t('checkout.returnOn', { date: dateText })}
            </Text>
          </View>

          <AuthTextField
            testID="checkout-note"
            label={t('checkout.noteLabel')}
            value={note}
            onChangeText={setNote}
            maxLength={500}
          />

          {saveError === null ? null : (
            <FailureNotice code={saveError} message={t('checkout.saveFailed')} />
          )}
          {!isOnline ? (
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('checkout.needsConnection')}
            </Text>
          ) : !isReady ? (
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('checkout.chooseAll')}
            </Text>
          ) : null}
          <PressableScale
            testID="checkout-save"
            accessibilityRole="button"
            accessibilityLabel={
              recordCheckout.isPending ? t('checkout.saving') : t('checkout.save')
            }
            onPress={save}
            isDisabled={!isReady || !isOnline}
            isBusy={recordCheckout.isPending}
            haptic="tapLight"
            style={continuousCorners}
            className={`min-h-recommended items-center justify-center rounded-md px-lg ${
              isReady && isOnline ? 'bg-primary' : 'bg-neutral-300'
            }`}
          >
            <Text
              className={`text-center text-md font-bold ${isReady && isOnline ? 'text-white' : 'text-neutral-700'} ${fontClass}`}
            >
              {recordCheckout.isPending ? t('checkout.saving') : t('checkout.save')}
            </Text>
          </PressableScale>
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
