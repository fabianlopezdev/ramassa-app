/**
 * Dades › Dades legals (RAPP-699): what the forms ask for proof. The same
 * page as Dades de les jugadores, with its sections and rows:
 *
 *   - Consents, defined once: name and text in five languages, added,
 *     reworded and archived here. A system consent keeps its key, so the
 *     app's features still read it.
 *   - Signatures: the signature blocks of every form, read only, each opening
 *     its form.
 *   - Documents accepted: the app terms and the season authorization, read
 *     only, each opening its form.
 *
 * Each row says where it is asked with the chips the fields use. A text
 * saved here reaches players with the form's next Desa.
 */

import { Page, PageHeader } from '@/components/layout/page';
import { ConsentForm } from '@/components/legal/consent-form';
import { boardStep } from '@/components/onboarding/board-steps';
import { CatalogRow } from '@/components/profile-layout/catalog-row';
import { CatalogSection } from '@/components/profile-layout/catalog-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useProfileLayoutActions } from '@/lib/profile-layout-actions';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { customStepKey } from '@ramassa/shared/intake';
import {
  flowStepName,
  formBlockText,
  surfacesOfConsent,
  textIn,
  type Consent,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A row's link to the form that asks it. */
function OpenForm({ to, name }: { readonly to: string; readonly name: string }) {
  const { t } = useTranslation('settings');
  return (
    <Button asChild variant="outline" size="sm">
      <Link to={to} aria-label={t('legalData.openNamed', { name })}>
        {t('legalData.open')}
      </Link>
    </Button>
  );
}

export function LegalDataPanel({
  catalog,
  canEdit,
}: {
  readonly catalog: IntakeCatalog;
  readonly canEdit: boolean;
}) {
  const { t, i18n } = useTranslation(['settings', 'nav', 'onboarding']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const actions = useProfileLayoutActions();
  const [editing, setEditing] = useState<Consent | 'new' | null>(null);
  const live = new Set(catalog.screens.filter((screen) => !screen.isArchived).map((s) => s.id));

  // The consents in use first, the archived ones last, each group A to Z.
  const consents = [...(catalog.consents ?? [])].sort(
    (a, b) =>
      Number(a.isArchived) - Number(b.isArchived) ||
      textIn(a.name, language).localeCompare(textIn(b.name, language), language),
  );
  const screenName = (key: string) => {
    const step = boardStep(catalog, UUID_PATTERN.test(key) ? customStepKey(key) : key);
    return step === null
      ? textIn(catalog.screens.find((screen) => screen.id === key)?.title, language)
      : flowStepName(step, language, t);
  };

  const consentRows = consents.map((consent) => {
    const name = textIn(consent.name, language);
    return {
      id: consent.id,
      row: (
        <CatalogRow
          type="consent"
          name={name}
          detail={textIn(consent.body, language)}
          badge={
            consent.isArchived ? (
              <Badge variant="outline" className="text-muted-foreground">
                {t('legalData.archived')}
              </Badge>
            ) : null
          }
          surfaces={surfacesOfConsent(catalog.consentPlacements, consent.id)}
          action={
            canEdit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(consent)}
                aria-label={t('profileLayout.editNamed', { field: name })}
                data-testid={`legal-consent-edit-${consent.key}`}
              >
                {t('questions.edit')}
              </Button>
            ) : null
          }
          testId={`legal-consent-${consent.key}`}
        />
      ),
    };
  });

  const signatureRow = (
    id: string,
    name: string,
    detail: string,
    surface: 'onboarding' | 'entity_form' | 'authorization' | 'terms',
    to: string | null,
  ): { readonly id: string; readonly row: ReactNode } => ({
    id,
    row: (
      <CatalogRow
        type="signature"
        name={name}
        detail={detail}
        surfaces={[surface]}
        action={to === null ? null : <OpenForm to={to} name={name} />}
        testId={`legal-signature-${id}`}
      />
    ),
  });
  const signatureRows = [
    ...(catalog.blocks ?? [])
      .filter(
        (block) =>
          block.screenKey === null ||
          !UUID_PATTERN.test(block.screenKey) ||
          live.has(block.screenKey),
      )
      .map((block) =>
        block.surface === 'entity_form'
          ? signatureRow(
              block.id,
              formBlockText(block, language).text,
              t('nav:staff.referralForm'),
              'entity_form',
              '/entities/referral-form',
            )
          : signatureRow(
              block.id,
              formBlockText(block, language).text,
              `${t('nav:staff.onboarding')} · ${screenName(block.screenKey ?? '')}`,
              'onboarding',
              `/onboarding/screens/${block.screenKey ?? ''}`,
            ),
      ),
    signatureRow(
      'authorization',
      t('legalData.authorizationSignature'),
      t('nav:staff.authorization'),
      'authorization',
      '/forms/authorization/consents',
    ),
    signatureRow(
      'terms',
      t('legalData.termsSignature'),
      t('nav:staff.appTerms'),
      'terms',
      '/forms/terms',
    ),
  ];

  const documentRow = (
    id: string,
    name: string,
    surface: 'authorization' | 'terms',
    to: string,
  ): { readonly id: string; readonly row: ReactNode } => ({
    id,
    row: (
      <CatalogRow
        type="document"
        name={name}
        detail={t('nav:staff.legal')}
        surfaces={[surface]}
        action={<OpenForm to={to} name={name} />}
        testId={`legal-document-${id}`}
      />
    ),
  });

  return (
    <Page data-testid="legal-data">
      <PageHeader title={t('legalData.title')} />
      <CatalogSection
        testId="legal-data-consents"
        label={t('legalData.consents')}
        title={<h2 className="text-start text-base font-semibold">{t('legalData.consents')}</h2>}
        actions={
          canEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing('new')}
              data-testid="legal-consent-add"
            >
              <Plus aria-hidden data-icon="inline-start" />
              {t('legalData.addConsent')}
            </Button>
          ) : undefined
        }
        columnName={t('legalData.columnConsent')}
        columnBadge=""
        emptyLabel={t('legalData.noConsents')}
        rows={consentRows}
      />
      <CatalogSection
        testId="legal-data-signatures"
        label={t('legalData.signatures')}
        title={<h2 className="text-start text-base font-semibold">{t('legalData.signatures')}</h2>}
        columnName={t('legalData.columnSignature')}
        columnBadge=""
        emptyLabel={t('legalData.noConsents')}
        rows={signatureRows}
      />
      <CatalogSection
        testId="legal-data-documents"
        label={t('legalData.documents')}
        title={<h2 className="text-start text-base font-semibold">{t('legalData.documents')}</h2>}
        columnName={t('legalData.columnDocument')}
        columnBadge=""
        emptyLabel={t('legalData.noConsents')}
        rows={[
          documentRow('terms', t('nav:staff.appTerms'), 'terms', '/forms/terms'),
          documentRow(
            'authorization',
            t('nav:staff.authorization'),
            'authorization',
            '/forms/authorization',
          ),
        ]}
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogTitle>
            {editing === 'new' || editing === null
              ? t('legalData.newConsent')
              : textIn(editing.name, language)}
          </DialogTitle>
          <DialogDescription className="sr-only">{t('legalData.consentText')}</DialogDescription>
          {editing === null ? null : (
            <ConsentForm
              key={editing === 'new' ? 'new' : editing.id}
              consent={editing === 'new' ? null : editing}
              onSave={(draft) =>
                actions.saveConsent({ id: editing === 'new' ? null : editing.id, ...draft })
              }
              onCancel={() => setEditing(null)}
              secondaryAction={
                editing === 'new' ? undefined : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ms-2.5"
                    onClick={() => {
                      actions
                        .archiveConsent(editing.id, !editing.isArchived)
                        .then(() => setEditing(null))
                        .catch(() => toast.error(t('legalData.archiveFailed')));
                    }}
                    data-testid="legal-consent-archive"
                  >
                    {editing.isArchived ? t('legalData.unarchive') : t('legalData.archive')}
                  </Button>
                )
              }
              testId="legal-consent-form"
            />
          )}
        </DialogContent>
      </Dialog>
    </Page>
  );
}
