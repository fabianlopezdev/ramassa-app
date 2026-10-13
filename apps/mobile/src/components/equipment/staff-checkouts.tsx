/**
 * Checked-out material on the Stock screen (RAPP-252): who has what and when
 * it is due, late ones in red, and the check-in: how many came back and in
 * what condition. Pieces that do not come back stay out of stock as lost.
 */
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FailureNotice } from '@/components/error-code-line';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useItemLabel } from '@/lib/item-label';
import { useOpenCheckouts, useRecordCheckin } from '@/lib/stock';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import {
  RETURN_CONDITIONS,
  type OpenCheckout,
  type ReturnCondition,
} from '@ramassa/shared/equipment';
import { toAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';

export function useCheckoutDate() {
  const { i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
    day: 'numeric',
    month: 'short',
    timeZone: MADRID_TIME_ZONE,
  });
  // A calendar date: read at midday so no time zone moves it a day.
  return (date: string) => format.format(new Date(`${date}T12:00:00Z`));
}

function CheckInPanel({
  checkout,
  onClose,
}: {
  readonly checkout: OpenCheckout;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('participants');
  const fontClass = useLanguageFontClass();
  const [returned, setReturned] = useState(checkout.quantity);
  const [condition, setCondition] = useState<ReturnCondition | null>(null);
  const checkIn = useRecordCheckin();
  const missing = checkout.quantity - returned;
  const canSave = returned === 0 || condition !== null;

  const step = (label: string, a11y: string, change: number, disabled: boolean, testID: string) => (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={() => setReturned((current) => current + change)}
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

  return (
    <View className="gap-sm pt-sm">
      <Text className={`text-start text-md font-bold text-neutral-900 ${fontClass}`}>
        {t('checkout.checkInTitle')}
      </Text>
      <View className="flex-row items-center gap-md">
        {step('−', t('arrival.less'), -1, returned <= 0, 'checkin-less')}
        <Text
          testID="checkin-returned"
          className={`min-w-recommended text-center text-xl font-bold text-neutral-900 ${fontClass}`}
        >
          {returned}
        </Text>
        {step('+', t('arrival.more'), 1, returned >= checkout.quantity, 'checkin-more')}
      </View>
      {missing > 0 ? (
        <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
          {t('checkout.missing', { count: missing })}
        </Text>
      ) : null}
      {returned > 0 ? (
        <>
          <Text className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}>
            {t('checkout.conditionLabel')}
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t('checkout.conditionLabel')}
            className="flex-row flex-wrap gap-sm"
          >
            {RETURN_CONDITIONS.map((candidate) => (
              <ChoiceOption
                key={candidate}
                testID={`checkin-condition-${candidate}`}
                value={candidate}
                label={t(`material.condition.${candidate}`)}
                selected={candidate === condition}
                onSelect={setCondition}
                languageFontClass={fontClass}
              />
            ))}
          </View>
        </>
      ) : null}
      {checkIn.isError ? (
        <FailureNotice
          code={toAppError(checkIn.error).code}
          message={t('checkout.checkInFailed')}
        />
      ) : null}
      <View className="flex-row flex-wrap items-center gap-md">
        <PressableScale
          testID="checkin-save"
          accessibilityRole="button"
          accessibilityLabel={t('checkout.saveCheckIn')}
          onPress={() =>
            checkIn.mutate(
              { checkoutId: checkout.id, returned, condition: returned > 0 ? condition : null },
              { onSuccess: onClose },
            )
          }
          isDisabled={!canSave}
          isBusy={checkIn.isPending}
          haptic="tapLight"
          style={continuousCorners}
          className={`min-h-recommended items-center justify-center rounded-md px-lg ${
            canSave ? 'bg-primary' : 'bg-neutral-300'
          }`}
        >
          <Text className={`font-bold ${canSave ? 'text-white' : 'text-neutral-700'} ${fontClass}`}>
            {t('checkout.saveCheckIn')}
          </Text>
        </PressableScale>
        <PressableScale
          testID="checkin-cancel"
          accessibilityRole="button"
          accessibilityLabel={t('material.cancel')}
          onPress={onClose}
          haptic="tapLight"
          className="min-h-recommended justify-center"
        >
          <Text className={`font-semibold text-primary-dark ${fontClass}`}>
            {t('material.cancel')}
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

export function StaffCheckouts({ canCheckIn }: { readonly canCheckIn: boolean }) {
  const { t } = useTranslation('participants');
  const itemLabel = useItemLabel();
  const fontClass = useLanguageFontClass();
  const formatDate = useCheckoutDate();
  const checkouts = useOpenCheckouts();
  const [open, setOpen] = useState<string | null>(null);
  const rows = checkouts.data ?? [];

  return (
    <View className="gap-sm" testID="stock-checkouts">
      <Text
        accessibilityRole="header"
        className={`text-start text-xl font-bold text-neutral-900 ${fontClass}`}
      >
        {t('checkout.listTitle')}
      </Text>
      {checkouts.isSuccess && rows.length === 0 ? (
        <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
          {t('checkout.listEmpty')}
        </Text>
      ) : null}
      {rows.map((row) => {
        const item =
          row.size === null ? itemLabel(row.itemKey) : `${itemLabel(row.itemKey)} ${row.size}`;
        return (
          <View
            key={row.id}
            testID={`checkout-row-${row.id}`}
            style={continuousCorners}
            className={`gap-xs rounded-md border bg-white p-md ${row.isOverdue ? 'border-error' : 'border-neutral-200'}`}
          >
            <Text className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}>
              {t('checkout.row', { item, quantity: row.quantity, name: row.staffName })}
            </Text>
            <Text
              className={`text-start text-sm ${row.isOverdue ? 'font-semibold text-error' : 'text-neutral-700'} ${fontClass}`}
            >
              {row.isOverdue
                ? t('checkout.overdue', { date: formatDate(row.expectedReturnOn) })
                : t('checkout.returnOn', { date: formatDate(row.expectedReturnOn) })}
            </Text>
            {row.note === null ? null : (
              <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>{row.note}</Text>
            )}
            {canCheckIn && open !== row.id ? (
              <PressableScale
                testID={`checkout-checkin-${row.id}`}
                accessibilityRole="button"
                accessibilityLabel={t('checkout.checkIn')}
                onPress={() => setOpen(row.id)}
                haptic="tapLight"
                className="min-h-recommended self-start justify-center"
              >
                <Text className={`font-semibold text-primary-dark ${fontClass}`}>
                  {t('checkout.checkIn')}
                </Text>
              </PressableScale>
            ) : null}
            {open === row.id ? <CheckInPanel checkout={row} onClose={() => setOpen(null)} /> : null}
          </View>
        );
      })}
    </View>
  );
}
