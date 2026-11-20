/**
 * Check material out to a staff member (RAPP-252): for a trip or an event,
 * never for a normal session. The item, size and quantity, who takes it, and
 * when it comes back. The checkout's id is made once, so a second press after
 * a lost answer saves nothing twice.
 */
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FailureNotice } from '@/components/error-code-line';
import { ChoiceGroup } from '@/components/forms/choice-group';
import { FieldLabel } from '@/components/forms/field-label';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { ActionScreen } from '@/components/layout/screen-action';
import { screenContentClassName } from '@/components/layout/screen-spacing';
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
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RETURN_IN_DAYS, returnDateIn } from '@ramassa/shared/equipment';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';

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
    <RaisedActionButton
      testID={testID}
      size="fit"
      label={label}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      isDisabled={disabled}
    />
  );
}

export default function NewCheckoutScreen() {
  const { t, i18n } = useTranslation('participants');
  const itemLabel = useItemLabel();
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
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['left', 'right']}>
      <ActionScreen
        action={
          <AuthSubmitButton
            testID="checkout-save"
            label={recordCheckout.isPending ? t('checkout.saving') : t('checkout.save')}
            onPress={save}
            isLoading={recordCheckout.isPending}
            disabled={!isReady || !isOnline}
          />
        }
      >
        <NativeScreenHeader title={t('checkout.title')} />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="pb-3xl"
        >
          <PageWidth className={screenContentClassName}>
            <View className="gap-xs">
              <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                {t('checkout.intro')}
              </Text>
            </View>

            <ChoiceGroup label={t('arrival.itemLabel')}>
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
            </ChoiceGroup>
            {needsSize ? (
              <ChoiceGroup label={t('arrival.sizeLabel')}>
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
              </ChoiceGroup>
            ) : null}

            <View className="gap-sm">
              <FieldLabel>{t('arrival.quantityLabel')}</FieldLabel>
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

            <ChoiceGroup label={t('checkout.staffLabel')}>
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
            </ChoiceGroup>

            <View className="gap-sm">
              <ChoiceGroup label={t('checkout.returnLabel')}>
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
              </ChoiceGroup>
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
          </PageWidth>
        </ScrollView>
      </ActionScreen>
    </SafeAreaView>
  );
}
