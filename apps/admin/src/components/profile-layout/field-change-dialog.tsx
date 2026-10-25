/**
 * The confirmation before a change to a field that has answers is saved
 * (RAPP-665, D8). It says in plain words, with the database's own counts
 * (`preview_field_change`), what happens to her answers: how many convert to
 * the new type and how many leave the field for her history, how many are
 * stored encrypted or in clear, how many team members start or stop seeing
 * them, which features stop or start reading the field, which fields stop
 * depending on it, and the app screen that asks it.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';
import type { FieldChangePreview, FieldFeatureKey } from '@ramassa/shared/intake-builder';

/** The sentences of the dialog, in order, as translation keys and values. */
export function changeSentences(
  preview: FieldChangePreview,
  appScreen: string | null,
): ReadonlyArray<{ readonly key: string; readonly values?: Record<string, unknown> }> {
  const lines: { key: string; values?: Record<string, unknown> }[] = [
    { key: 'fieldChange.answers', values: { count: preview.answers } },
  ];
  if (preview.isTypeChange) {
    if (preview.converted > 0) {
      lines.push({ key: 'fieldChange.converted', values: { count: preview.converted } });
    }
    if (preview.notConverted > 0) {
      lines.push({ key: 'fieldChange.notConverted', values: { count: preview.notConverted } });
    }
    if (appScreen !== null) lines.push({ key: 'fieldChange.appScreen', values: { appScreen } });
  }
  if (preview.isPrivacyChange) {
    lines.push({
      key: 'fieldChange.privacy',
      values: { from: preview.privacyFrom, to: preview.privacyTo },
    });
    if (preview.toEncrypt > 0) {
      lines.push({ key: 'fieldChange.encrypt', values: { count: preview.toEncrypt } });
    }
    if (preview.toDecrypt > 0) {
      lines.push({ key: 'fieldChange.decrypt', values: { count: preview.toDecrypt } });
    }
    if (preview.readersLosing > 0) {
      lines.push({ key: 'fieldChange.readersLosing', values: { count: preview.readersLosing } });
    }
    if (preview.readersGaining > 0) {
      lines.push({ key: 'fieldChange.readersGaining', values: { count: preview.readersGaining } });
    }
  }
  if (preview.conditionsCleared > 0) {
    lines.push({ key: 'fieldChange.conditions', values: { count: preview.conditionsCleared } });
  }
  return lines;
}

function FeatureList({
  title,
  features,
  testId,
}: {
  readonly title: string;
  readonly features: readonly FieldFeatureKey[];
  readonly testId: string;
}) {
  const { t } = useTranslation('settings');
  if (features.length === 0) return null;
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <p className="text-start text-sm font-medium">{title}</p>
      <ul className="list-disc ps-5 text-start text-sm text-muted-foreground">
        {features.map((feature) => (
          <li key={feature}>{t(`fieldChange.features.${feature}`)}</li>
        ))}
      </ul>
    </div>
  );
}

export function FieldChangeDialog({
  fieldName,
  preview,
  appScreen,
  onConfirm,
  onCancel,
}: {
  readonly fieldName: string;
  /** Null closes the dialog. */
  readonly preview: FieldChangePreview | null;
  /** The key of the app screen that asks the field with its own control, if any. */
  readonly appScreen: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation('settings');
  const level = (privacy: string) => t(`questions.privacyLevels.${privacy}`);
  return (
    <AlertDialog
      open={preview !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent data-testid="field-change-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('fieldChange.title', { field: fieldName })}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2 text-start">
              {preview === null
                ? null
                : changeSentences(preview, appScreen).map(({ key, values }) => (
                    <p key={key} data-testid={`field-change-${key.split('.')[1]}`}>
                      {t(key, {
                        ...values,
                        ...(values?.from === undefined
                          ? {}
                          : { from: level(String(values.from)), to: level(String(values.to)) }),
                        ...(values?.appScreen === undefined
                          ? {}
                          : { screen: t(`builtinScreens.screenName.${String(values.appScreen)}`) }),
                      })}
                    </p>
                  ))}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {preview === null ? null : (
          <>
            <FeatureList
              title={t('fieldChange.featuresLost')}
              features={preview.featuresLost}
              testId="field-change-features-lost"
            />
            <FeatureList
              title={t('fieldChange.featuresRegained')}
              features={preview.featuresRegained}
              testId="field-change-features-regained"
            />
          </>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="field-change-cancel">
            {t('questions.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} data-testid="field-change-confirm">
            {t('fieldChange.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
