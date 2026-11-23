/**
 * A team form's Respostes on their own page (RAPP-919): who answered, who is
 * pending and the deadline, each row opening her page. The form's page is its
 * board, as Onboarding is, and opens this page from its header. Someone who
 * reads responses but does not design forms lands here.
 */
import { formListPath } from '@/components/custom-forms/custom-form-page';
import { EditorSection } from '@/components/layout/editor-section';
import { Page, PageHeader } from '@/components/layout/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CustomFormData } from '@/lib/custom-forms';
import { Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { textIn, type CustomForm, type CustomFormResponse } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function CustomFormResponsesPage({
  data,
  formId,
}: {
  readonly data: CustomFormData;
  readonly formId: string;
}) {
  const { t, i18n } = useTranslation(['settings', 'nav']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const form = (data.intakeCatalog.customForms ?? []).find((each) => each.id === formId);
  // The app's legal forms are answered in their ledgers: no responses here (RAPP-772, RAPP-773).
  const hasResponses = form !== undefined && form.systemKey === null && data.canReadResponses;
  return (
    <Page data-testid="custom-form-responses-page">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="-ms-2.5 w-fit text-muted-foreground">
          {/* Back to the board for whoever designs it; else to the list. */}
          {data.canDesign && form !== undefined ? (
            <Link
              to="/forms/custom/$formId"
              params={{ formId }}
              data-testid="custom-form-responses-back"
            >
              <ChevronLeft aria-hidden data-icon="inline-start" className="rtl:rotate-180" />
              {t('customForms.tab.screens')}
            </Link>
          ) : (
            <Link to={formListPath(form)} data-testid="custom-form-responses-back">
              <ChevronLeft aria-hidden data-icon="inline-start" className="rtl:rotate-180" />
              {t('nav:staff.customForms')}
            </Link>
          )}
        </Button>
        <PageHeader
          title={form === undefined ? t('customForms.notFound') : textIn(form.name, language)}
        />
      </div>
      {hasResponses ? <FormResponses form={form} responses={data.responses} /> : null}
    </Page>
  );
}

function FormResponses({
  form,
  responses,
}: {
  readonly form: CustomForm;
  readonly responses: readonly CustomFormResponse[];
}) {
  const { t, i18n } = useTranslation('settings');
  const locale = i18n.resolvedLanguage ?? 'ca';
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const done = responses.filter((response) => response.status === 'done').length;
  const pending = responses.filter((response) => response.status === 'pending').length;
  return (
    <EditorSection
      title={
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-start">
          <span className="text-base font-semibold">{t('customForms.tab.responses')}</span>
          <span className="text-sm text-muted-foreground">
            {t('customForms.responsesSummary', { done, pending })}
          </span>
          {form.deadline === null ? null : (
            <span className="text-sm text-muted-foreground">
              {t('customForms.deadlineOn', { date: date.format(new Date(form.deadline)) })}
            </span>
          )}
        </span>
      }
      isFlush
      testId="custom-form-responses"
    >
      {responses.length === 0 ? (
        <p className="px-5 py-5 text-start text-sm text-muted-foreground">
          {t('customForms.noResponses')}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('customForms.column.player')}</TableHead>
              <TableHead>{t('customForms.column.status')}</TableHead>
              <TableHead>{t('customForms.column.asked')}</TableHead>
              <TableHead>{t('customForms.column.answered')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {responses.map((response) => (
              <TableRow key={response.responseId} data-testid={`response-${response.responseId}`}>
                <TableCell>
                  <Link
                    to="/participants/$participantId"
                    params={{ participantId: response.profileId }}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {response.displayName ??
                      t('customForms.playerNumber', { number: response.memberNumber ?? '' })}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={response.status === 'pending' ? 'outline' : 'secondary'}>
                    {t(`customForms.response.${response.status}`)}
                  </Badge>
                  <span className="ms-2 text-xs text-muted-foreground">
                    {[
                      t('customForms.versionOf', { version: response.version }),
                      response.seasonName,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </TableCell>
                <TableCell>{date.format(new Date(response.askedAt))}</TableCell>
                <TableCell>
                  {response.answeredAt === null
                    ? null
                    : [date.format(new Date(response.answeredAt)), response.answeredByName]
                        .filter(Boolean)
                        .join(' · ')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </EditorSection>
  );
}
