/**
 * The season authorization's overview (RAPP-927). The authorization is the one
 * form organized by season, so its page starts from the seasons:
 *
 *   - Temporada vigent: the version players sign now, with Veure (the version
 *     read-only, RAPP-924) and Edita (the board, with this season picked to
 *     publish to).
 *   - The next season: when it exists, its version or that none is published
 *     yet, Edita and Fes-la vigent once a version is published for it. When
 *     it does not, Prepara la temporada creates it and opens the board for it.
 *   - Temporades anteriors: each earlier season's versions, with Veure.
 *
 * Every change on the board is a draft until Publica, as before.
 */
import { useStepUp } from '@/components/auth/step-up';
import { Page, PageHeader } from '@/components/layout/page';
import { useReload } from '@/components/settings/onboarding-design-sections';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { CustomFormData } from '@/lib/custom-forms';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { AuthorizationVersion } from '@ramassa/shared/authorization';
import { customFormById, textIn } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { createSeason, seasonAfter, setCurrentSeason, type Season } from '@ramassa/shared/seasons';

/** A season's published versions, newest first. */
function versionsOf(
  versions: readonly AuthorizationVersion[],
  seasonId: string,
): readonly AuthorizationVersion[] {
  return versions
    .filter((version) => version.publishedAt !== null && version.seasonId === seasonId)
    .sort((a, b) => (b.versionNumber ?? 0) - (a.versionNumber ?? 0));
}

export function AuthorizationOverview({
  data,
  formId,
}: {
  readonly data: CustomFormData;
  readonly formId: string;
}) {
  const { t, i18n } = useTranslation('settings');
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const form = customFormById(data.intakeCatalog, formId);
  const seasons = [...data.seasons].sort((a, b) => b.startsOn.localeCompare(a.startsOn));
  const current = seasons.find((season) => season.isCurrent) ?? null;
  const later = seasons
    .filter((season) => current === null || season.startsOn > current.startsOn)
    .filter((season) => season !== current)
    .reverse();
  const earlier =
    current === null ? [] : seasons.filter((season) => season.startsOn < current.startsOn);
  const newest = later.at(-1) ?? current;
  const hasDraft = data.authorizationVersions.some((version) => version.publishedAt === null);
  return (
    <Page data-testid="authorization-overview">
      <PageHeader
        title={form === undefined ? t('authorizationVersionsTitle') : textIn(form.name, language)}
      />
      {current === null ? (
        <section className="rounded-xl border bg-card p-5" data-testid="authorization-no-current">
          <p className="text-start text-sm text-muted-foreground">
            {t('authorizationOverview.noCurrent')}
          </p>
        </section>
      ) : (
        <SeasonCard
          data={data}
          formId={formId}
          season={current}
          title={t('authorizationOverview.currentTitle', { season: current.name })}
          note={hasDraft ? t('authorizationOverview.unpublishedChanges') : null}
          testId="authorization-current"
        />
      )}
      {later.map((season) => (
        <SeasonCard
          key={season.id}
          data={data}
          formId={formId}
          season={season}
          title={t('authorizationOverview.nextTitle', { season: season.name })}
          note={null}
          canMakeCurrent
          testId={`authorization-next-${season.id}`}
        />
      ))}
      {data.canDesign ? <PrepareSeason after={newest} formId={formId} /> : null}
      {earlier.length === 0 ? null : (
        <section
          className="flex flex-col gap-3 rounded-xl border bg-card p-5"
          data-testid="authorization-previous"
        >
          <h2 className="text-start text-base font-semibold">
            {t('authorizationOverview.previousTitle')}
          </h2>
          <ul className="flex flex-col divide-y">
            {earlier.flatMap((season) => {
              const versions = versionsOf(data.authorizationVersions, season.id);
              return versions.length === 0
                ? [
                    <li key={season.id} className="py-2 text-start text-sm">
                      <span className="font-medium">{season.name}</span>
                      <span className="ms-2 text-muted-foreground">
                        {t('authorizationOverview.notPublished')}
                      </span>
                    </li>,
                  ]
                : versions.map((version) => (
                    <li
                      key={version.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-start text-sm"
                    >
                      <span className="font-medium">{season.name}</span>
                      <VersionLine version={version} />
                      <ViewLink formId={formId} version={version} />
                    </li>
                  ));
            })}
          </ul>
        </section>
      )}
    </Page>
  );
}

function VersionLine({ version }: { readonly version: AuthorizationVersion }) {
  const { t, i18n } = useTranslation('settings');
  return (
    <span className="text-muted-foreground">
      {[
        t('authorizationOverview.versionPublished', {
          number: version.versionNumber ?? 0,
          date: new Date(version.publishedAt ?? '').toLocaleDateString(i18n.resolvedLanguage),
        }),
        t('authorizationOverview.signatures', { count: version.signatureCount }),
      ].join(' · ')}
    </span>
  );
}

function ViewLink({
  formId,
  version,
}: {
  readonly formId: string;
  readonly version: AuthorizationVersion;
}) {
  const { t } = useTranslation('settings');
  return (
    <Button asChild variant="outline" size="sm">
      <Link
        to="/forms/custom/$formId/versions/$versionKey"
        params={{ formId, versionKey: version.id }}
        data-testid={`authorization-view-${version.id}`}
      >
        {t('formVersionView')}
      </Link>
    </Button>
  );
}

/** One season: the version it signs (the one in force, else the newest), Veure and Edita. */
function SeasonCard({
  data,
  formId,
  season,
  title,
  note,
  canMakeCurrent = false,
  testId,
}: {
  readonly data: CustomFormData;
  readonly formId: string;
  readonly season: Season;
  readonly title: string;
  readonly note: string | null;
  readonly canMakeCurrent?: boolean;
  readonly testId: string;
}) {
  const { t } = useTranslation('settings');
  const reload = useReload();
  const withStepUp = useStepUp();
  const [isBusy, setIsBusy] = useState(false);
  const versions = versionsOf(data.authorizationVersions, season.id);
  const live = versions.find((version) => version.isCurrent) ?? versions[0];

  async function makeCurrent() {
    setIsBusy(true);
    try {
      await withStepUp(() => setCurrentSeason(supabase, season.id));
      await reload();
    } catch {
      toast.error(t('customForms.actionFailed'));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-start text-base font-semibold">{title}</h2>
      </div>
      <p className="text-start text-sm">
        {live === undefined ? (
          <span className="text-muted-foreground">{t('authorizationOverview.notPublished')}</span>
        ) : (
          <VersionLine version={live} />
        )}
      </p>
      {note === null ? null : <p className="text-start text-sm text-muted-foreground">{note}</p>}
      <div className="flex flex-wrap gap-2">
        {live === undefined ? null : <ViewLink formId={formId} version={live} />}
        {data.canDesign ? (
          <Button asChild size="sm">
            <Link
              to="/forms/custom/$formId"
              params={{ formId }}
              search={{ season: season.id }}
              data-testid={`${testId}-edit`}
            >
              {t('authorizationOverview.edit')}
            </Link>
          </Button>
        ) : null}
        {canMakeCurrent && data.canDesign && live !== undefined ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => void makeCurrent()}
            data-testid={`${testId}-make-current`}
          >
            {t('seasonSetCurrent')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/** Prepara la temporada: creates the season after the newest one, then opens the board for it. */
function PrepareSeason({
  after,
  formId,
}: {
  readonly after: Season | null;
  readonly formId: string;
}) {
  const { t, i18n } = useTranslation(['settings', 'common']);
  const navigate = useNavigate();
  const withStepUp = useStepUp();
  const [isBusy, setIsBusy] = useState(false);
  const next = seasonAfter(after);
  // A season to come that is still unpublished is prepared from its own card.
  if (after !== null && !after.isCurrent) return null;

  async function prepare() {
    setIsBusy(true);
    try {
      const seasonId = await withStepUp(() =>
        createSeason(supabase, { name: next.name, startsOn: next.startsOn, makeCurrent: false }),
      );
      await navigate({
        to: '/forms/custom/$formId',
        params: { formId },
        search: { season: seasonId },
      });
    } catch {
      toast.error(t('customForms.actionFailed'));
      setIsBusy(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          data-testid="authorization-prepare"
        >
          <Plus aria-hidden data-icon="inline-start" />
          {t('authorizationOverview.prepare', { season: next.name })}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('authorizationOverview.prepare', { season: next.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('authorizationOverview.prepareBody', {
              date: new Date(`${next.startsOn}T12:00:00`).toLocaleDateString(i18n.resolvedLanguage),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common:close')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isBusy}
            onClick={(event) => {
              event.preventDefault();
              void prepare();
            }}
            data-testid="authorization-prepare-confirm"
          >
            {t('authorizationOverview.prepareConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
