/**
 * One published version of a form, read-only (RAPP-924): its screens as her
 * phone showed them, in her order and numbered as on the board, under the
 * version and its season. Opened from Veure in Versions publicades, so the
 * team can see how an earlier season's authorization looked.
 */
import { formBoardNumbers, FormScreenPhone } from '@/components/custom-forms/custom-form-page';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import type { CustomFormData } from '@/lib/custom-forms';
import { Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  customFormById,
  formScreensInOrder,
  textIn,
  withSeasonName,
  type PublishedFormVersion,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function FormVersionPage({
  data,
  formId,
  version,
}: {
  readonly data: CustomFormData;
  readonly formId: string;
  readonly version: PublishedFormVersion | null;
}) {
  const { t, i18n } = useTranslation('settings');
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const form = customFormById(data.intakeCatalog, formId);
  const catalog = version?.catalog ?? null;
  const frozen = catalog === null ? undefined : customFormById(catalog, formId);
  const title =
    version === null
      ? t('customForms.notFound')
      : [t('customForms.versionOf', { version: version.number }), version.seasonName]
          .filter(Boolean)
          .join(' · ');
  // The authorization names the season it was published for (RAPP-785).
  const seasonName = version?.seasonName ?? null;
  const fill =
    form?.systemKey === 'season_authorization' && seasonName !== null
      ? (text: string) => withSeasonName(text, seasonName)
      : undefined;
  const screens =
    catalog === null || frozen === undefined ? [] : formScreensInOrder(catalog, frozen);
  const numbers =
    catalog === null || frozen === undefined
      ? new Map<string, string>()
      : formBoardNumbers(catalog, frozen);
  return (
    <Page data-testid="form-version-page">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="-ms-2.5 w-fit text-muted-foreground">
          <Link to="/forms/custom/$formId" params={{ formId }} data-testid="form-version-back">
            <ChevronLeft aria-hidden data-icon="inline-start" className="rtl:rotate-180" />
            {form === undefined ? t('customForms.notFound') : textIn(form.name, language)}
          </Link>
        </Button>
        <PageHeader
          title={title}
          description={
            version === null
              ? undefined
              : t('formVersionPublishedOn', {
                  date: new Date(version.publishedAt).toLocaleDateString(i18n.resolvedLanguage),
                })
          }
        />
      </div>
      {version !== null && screens.length === 0 ? (
        <p className="text-start text-sm text-muted-foreground">{t('formVersionNoCopy')}</p>
      ) : null}
      {catalog === null ? null : (
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4">
          {screens.map((screen) => (
            <li
              key={screen.id}
              className="flex flex-col gap-3 rounded-xl border bg-card p-3"
              data-testid={`form-version-screen-${screen.id}`}
            >
              <span className="text-start text-sm font-medium text-muted-foreground">
                {t('onboardingBoard.step', { number: numbers.get(screen.id) ?? '' })}
              </span>
              <FormScreenPhone catalog={catalog} screen={screen} fill={fill} />
            </li>
          ))}
        </ol>
      )}
    </Page>
  );
}
