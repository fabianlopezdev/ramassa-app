/**
 * Her signatures (RAPP-690): every signature block she signed on her
 * Onboarding, and the ones the entity person signed on a referral that names
 * her. Each row says on which form, the text exactly as shown, who signed and
 * when, with the drawing; one signed on the walk-in tablet (RAPP-691) says so,
 * with the team member who was present. Only staff with participants.view_personal read
 * them, as the database does.
 */

import { SignatureDrawing } from '@/components/participants/participant-authorization-panel';
import { useTranslation } from 'react-i18next';
import {
  ramassaScreenIdOf,
  textIn,
  type IntakeCatalog,
  type ParticipantFormSignature,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function ParticipantSignatures({
  signatures,
  catalog,
}: {
  readonly signatures: readonly ParticipantFormSignature[];
  readonly catalog: IntakeCatalog;
}) {
  const { t, i18n } = useTranslation(['participants', 'settings']);
  const locale = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const formName = (signature: ParticipantFormSignature) => {
    if (signature.surface === 'entity_form') return t('participants:signatures.entityForm');
    const key = signature.screenKey ?? '';
    if (signature.surface === 'custom_form') {
      // A form the team created (RAPP-700): its name and the screen.
      const form = (catalog.customForms ?? []).find((each) =>
        each.screens.some((screen) => screen.id === key),
      );
      const screen = form?.screens.find((each) => each.id === key);
      return form === undefined
        ? key
        : [textIn(form.name, locale), screen === undefined ? '' : textIn(screen.title, locale)]
            .filter(Boolean)
            .join(' · ');
    }
    const screenId = ramassaScreenIdOf(key);
    if (screenId !== null) {
      const screen = catalog.screens.find((candidate) => candidate.id === screenId);
      return screen === undefined ? key : textIn(screen.title, locale);
    }
    return t(`settings:builtinScreens.screenName.${key}`, { defaultValue: key });
  };

  return (
    <section
      aria-labelledby="participant-signatures-title"
      className="flex flex-col gap-4 rounded-xl border bg-card p-5"
      data-testid="participant-signatures"
    >
      <h2 id="participant-signatures-title" className="text-start text-lg font-semibold">
        {t('participants:signatures.title')}
      </h2>
      <ul className="flex flex-col gap-3">
        {signatures.map((signature) => {
          const signer =
            signature.signerKind === 'entity'
              ? t('participants:signatures.entitySigner', { name: signature.signerName })
              : signature.signerName;
          return (
            <li
              key={signature.id}
              className="flex flex-col gap-2 rounded-lg border p-3"
              data-testid={`participant-signature-${signature.id}`}
            >
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-start text-muted-foreground">
                  {t('participants:signatures.form')}
                </dt>
                <dd className="text-start">{formName(signature)}</dd>
                <dt className="text-start text-muted-foreground">
                  {t('participants:signatures.text')}
                </dt>
                <dd className="text-start whitespace-pre-line" lang={signature.language}>
                  {signature.body}
                </dd>
                <dt className="text-start text-muted-foreground">
                  {t('participants:signatures.signer')}
                </dt>
                <dd className="text-start">{signer}</dd>
                {signature.signedOnTablet ? (
                  <dd
                    className="col-start-2 text-start text-muted-foreground"
                    data-testid={`participant-signature-${signature.id}-tablet`}
                  >
                    {signature.witnessedByName === null
                      ? t('participants:signatures.onTablet')
                      : t('participants:signatures.onTabletWith', {
                          name: signature.witnessedByName,
                        })}
                  </dd>
                ) : null}
                <dt className="text-start text-muted-foreground">
                  {t('participants:signatures.date')}
                </dt>
                <dd className="text-start">
                  {new Date(signature.signedAt).toLocaleString(locale, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: 'Europe/Madrid',
                  })}
                </dd>
              </dl>
              {signature.strokes === null ? null : (
                <SignatureDrawing
                  strokes={signature.strokes}
                  label={t('participants:signatures.drawing', { name: signature.signerName })}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
