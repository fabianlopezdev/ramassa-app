/**
 * Her material on the participant card (RAPP-249): what she received, handed
 * over from this phone and waiting to send, and lent items to take back. A
 * return is graded New, Good, Worn or Unusable; an unusable item leaves stock.
 * Each row opens its details (RAPP-283): who handed it over, the note, her
 * signature or why she did not sign, the statement language, and who recorded
 * the return.
 */
import { ChoiceOption } from '@/components/equipment/choice-option';
import { SignaturePreview } from '@/components/equipment/signature-pad';
import { FailureNotice } from '@/components/error-code-line';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import {
  useHandoverOutbox,
  useParticipantMaterial,
  useParticipantMaterialDetail,
  useRecordReturn,
} from '@/lib/handover';
import { useItemLabel } from '@/lib/item-label';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import {
  awaitsReturn,
  RETURN_CONDITIONS,
  type ParticipantMaterialRow,
  type ReturnCondition,
} from '@ramassa/shared/equipment';
import { toAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE, LANGUAGE_NATIVE_NAMES } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

function useDateFormat() {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
      day: 'numeric',
      month: 'short',
      timeZone: MADRID_TIME_ZONE,
    });
    // A calendar date: read at midday so no time zone moves it a day.
    return (value: string) => format.format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
  }, [i18n.resolvedLanguage]);
}

function TextLink({
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
      className="min-h-recommended self-start justify-center"
    >
      <Text className={`font-semibold text-primary-dark ${fontClass}`}>{label}</Text>
    </PressableScale>
  );
}

function ReturnPanel({
  row,
  participantId,
  onClose,
}: {
  readonly row: ParticipantMaterialRow;
  readonly participantId: string;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('participants');
  const fontClass = useLanguageFontClass();
  const [condition, setCondition] = useState<ReturnCondition | null>(null);
  const recordReturn = useRecordReturn(participantId);
  const save = () => {
    if (condition === null) return;
    recordReturn.mutate({ deliveryId: row.deliveryId, condition }, { onSuccess: onClose });
  };
  return (
    <View className="gap-sm pt-sm">
      <Text className={`text-start text-md font-bold text-neutral-900 ${fontClass}`}>
        {t('material.returnTitle')}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('material.returnTitle')}
        className="flex-row flex-wrap gap-sm"
      >
        {RETURN_CONDITIONS.map((candidate) => (
          <ChoiceOption
            key={candidate}
            testID={`return-condition-${candidate}`}
            value={candidate}
            label={t(`material.condition.${candidate}`)}
            selected={candidate === condition}
            onSelect={setCondition}
            languageFontClass={fontClass}
          />
        ))}
      </View>
      {condition === 'unusable' ? (
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
          {t('material.unusableHint')}
        </Text>
      ) : null}
      {recordReturn.isError ? (
        <FailureNotice
          code={toAppError(recordReturn.error).code}
          message={t('material.returnFailed')}
        />
      ) : null}
      <View className="flex-row flex-wrap items-center gap-md">
        <PressableScale
          testID="return-save"
          accessibilityRole="button"
          accessibilityLabel={t('material.saveReturn')}
          isDisabled={condition === null}
          isBusy={recordReturn.isPending}
          onPress={save}
          haptic="tapLight"
          style={continuousCorners}
          className={`min-h-recommended items-center justify-center rounded-md px-lg ${
            condition === null ? 'bg-neutral-300' : 'bg-primary'
          }`}
        >
          {recordReturn.isPending ? (
            <ActivityIndicator color={tokens.colors.white} />
          ) : (
            <Text
              className={`font-bold ${condition === null ? 'text-neutral-700' : 'text-white'} ${fontClass}`}
            >
              {t('material.saveReturn')}
            </Text>
          )}
        </PressableScale>
        <TextLink
          testID="return-cancel"
          label={t('material.cancel')}
          onPress={onClose}
          fontClass={fontClass}
        />
      </View>
    </View>
  );
}

function MaterialDetail({ deliveryId }: { readonly deliveryId: string }) {
  const { t } = useTranslation('participants');
  const fontClass = useLanguageFontClass();
  const detail = useParticipantMaterialDetail(deliveryId);
  if (detail.isPending) return <ActivityIndicator color={tokens.colors.primary.DEFAULT} />;
  if (detail.isError || detail.data === null) {
    return (
      <Text className={`text-start text-sm text-error ${fontClass}`}>
        {t('material.detail.loadFailed')}
      </Text>
    );
  }
  const data = detail.data;
  const lines = [
    data.deliveredByName === null
      ? null
      : t('material.detail.handedBy', { name: data.deliveredByName }),
    data.note === null ? null : t('material.detail.note', { note: data.note }),
    data.signatureReason === null
      ? null
      : t('material.detail.reason', { reason: data.signatureReason }),
    data.statementLanguage === null
      ? null
      : t('material.detail.language', {
          language: LANGUAGE_NATIVE_NAMES[data.statementLanguage],
        }),
    data.returnedByName === null
      ? null
      : t('material.detail.returnedBy', { name: data.returnedByName }),
  ].filter((line): line is string => line !== null);
  return (
    <View className="gap-xs" testID={`material-detail-${deliveryId}`}>
      {lines.map((line) => (
        <Text key={line} className={`text-start text-sm text-neutral-800 ${fontClass}`}>
          {line}
        </Text>
      ))}
      {data.strokes === null ? null : (
        <SignaturePreview
          strokes={data.strokes}
          accessibilityLabel={t('material.signatureLabel')}
        />
      )}
    </View>
  );
}

export function ParticipantMaterial({ participantId }: { readonly participantId: string }) {
  const { t } = useTranslation('participants');
  const itemLabel = useItemLabel();
  const fontClass = useLanguageFontClass();
  const formatDate = useDateFormat();
  const material = useParticipantMaterial(participantId);
  const { entries, retry, discard } = useHandoverOutbox();
  const waiting = entries.filter((entry) => entry.participantId === participantId);
  const [returning, setReturning] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const rows = material.data ?? [];
  const itemWithSize = (key: string, size: string | null) =>
    size === null ? itemLabel(key) : `${itemLabel(key)} ${size}`;

  return (
    <View testID="participant-material" className="gap-sm">
      <Text
        accessibilityRole="header"
        className={`text-start text-xl font-bold text-neutral-900 ${fontClass}`}
      >
        {t('material.materialTitle')}
      </Text>
      {material.isError ? (
        <FailureNotice code={toAppError(material.error).code} message={t('material.loadFailed')} />
      ) : null}
      {waiting.map((entry) => (
        <View
          key={entry.id}
          testID={`material-waiting-${entry.id}`}
          style={continuousCorners}
          className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
        >
          <Text className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}>
            {itemWithSize(entry.itemKey, entry.size)}
          </Text>
          <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
            {entry.rejection == null ? t('material.waiting') : t('material.rejected')}
          </Text>
          {entry.rejection == null ? null : (
            <View className="flex-row flex-wrap gap-md">
              <TextLink
                testID={`material-retry-${entry.id}`}
                label={t('material.retry')}
                onPress={() => retry(entry.id)}
                fontClass={fontClass}
              />
              <TextLink
                testID={`material-remove-${entry.id}`}
                label={t('material.remove')}
                onPress={() => discard(entry.id)}
                fontClass={fontClass}
              />
            </View>
          )}
        </View>
      ))}
      {material.isPending ? <ActivityIndicator color={tokens.colors.primary.DEFAULT} /> : null}
      {material.isSuccess && rows.length === 0 && waiting.length === 0 ? (
        <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
          {t('material.materialEmpty')}
        </Text>
      ) : null}
      {rows.map((row) => {
        const details = [
          t(row.mode === 'lent' ? 'material.lent' : 'material.given', {
            date: formatDate(row.deliveredOn),
          }),
          row.returnedAt === null || row.returnCondition === null
            ? null
            : t('material.returned', {
                date: formatDate(row.returnedAt),
                condition: t(`material.condition.${row.returnCondition}`),
              }),
          row.signatureState === 'signed' ? null : t(`material.signature.${row.signatureState}`),
        ].filter((detail): detail is string => detail !== null);
        return (
          <View
            key={row.deliveryId}
            testID={`material-row-${row.deliveryId}`}
            style={continuousCorners}
            className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
          >
            <View className="flex-row flex-wrap items-baseline justify-between gap-sm">
              <Text className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}>
                {itemWithSize(row.itemKey, row.size)}
              </Text>
              {row.unitCode === null ? null : (
                <Text selectable className="text-sm font-semibold text-neutral-700">
                  {row.unitCode}
                </Text>
              )}
            </View>
            {details.map((detail) => (
              <Text key={detail} className={`text-start text-sm text-neutral-700 ${fontClass}`}>
                {detail}
              </Text>
            ))}
            <TextLink
              testID={`material-details-${row.deliveryId}`}
              label={t(opened === row.deliveryId ? 'material.detail.hide' : 'material.detail.show')}
              onPress={() => setOpened(opened === row.deliveryId ? null : row.deliveryId)}
              fontClass={fontClass}
            />
            {opened === row.deliveryId ? <MaterialDetail deliveryId={row.deliveryId} /> : null}
            {awaitsReturn(row) && returning !== row.deliveryId ? (
              <TextLink
                testID={`material-return-${row.deliveryId}`}
                label={t('material.recordReturn')}
                onPress={() => setReturning(row.deliveryId)}
                fontClass={fontClass}
              />
            ) : null}
            {returning === row.deliveryId ? (
              <ReturnPanel
                row={row}
                participantId={participantId}
                onClose={() => setReturning(null)}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
