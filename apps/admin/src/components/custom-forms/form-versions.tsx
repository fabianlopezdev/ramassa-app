/**
 * The published versions of a form (RAPP-771): one panel for every form. A
 * form shows it on its page, the app's legal forms with their ledgers'
 * versions (RAPP-772, RAPP-773).
 *
 * The draft comes first, with the note that test players see it on a legal
 * form. Then the versions, newest first: by season when the form belongs to
 * seasons, each with its date, how many accepted it when that is counted,
 * and whether it was a Correcció or is the one in force.
 */

import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

/** One published version as the panel lists it. */
export interface FormVersionRow {
  readonly key: string;
  readonly number: number;
  readonly publishedAt: string;
  readonly isCorrection: boolean;
  /** The version players are shown now. */
  readonly isCurrent: boolean;
  /** How many accepted it, when the form counts them (the app terms). */
  readonly count?: number;
}

/** The versions of one season, or every version when the form has no seasons (`season` null). */
export interface FormVersionGroup {
  readonly key: string;
  readonly season: { readonly name: string; readonly isCurrent: boolean } | null;
  readonly versions: readonly FormVersionRow[];
}

export function FormVersions({
  title,
  draft,
  groups,
  testId,
}: {
  readonly title: string;
  /** The draft waiting to be published; null when there is none. */
  readonly draft: {
    /** When it was last saved; null when the form does not keep it. */
    readonly updatedAt: string | null;
    /** A legal form's draft reaches the test players. */
    readonly isSeenByTestPlayers: boolean;
  } | null;
  readonly groups: readonly FormVersionGroup[];
  readonly testId: string;
}) {
  const { t, i18n } = useTranslation('settings');
  const date = (value: string) => new Date(value).toLocaleDateString(i18n.resolvedLanguage);
  const isEmpty = draft === null && groups.every((group) => group.versions.length === 0);
  const rows = (versions: readonly FormVersionRow[]) =>
    versions.map((version) => (
      <li
        key={version.key}
        className="text-start text-sm"
        data-testid={`${testId}-${version.number}`}
      >
        {version.count === undefined
          ? t('authorizationVersionInSeason', {
              number: version.number,
              date: date(version.publishedAt),
            })
          : t('appTerms.versionRow', {
              number: version.number,
              date: date(version.publishedAt),
              count: version.count,
            })}
        {version.isCorrection ? <VersionBadge label={t('saveDialog.correction')} /> : null}
        {version.isCurrent ? <VersionBadge label={t('authorizationCurrentBadge')} /> : null}
      </li>
    ));
  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-5" data-testid={testId}>
      <h2 className="text-start text-base font-semibold">{title}</h2>
      {isEmpty ? (
        <p className="text-start text-sm text-muted-foreground">{t('authorizationNoVersions')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {draft === null ? null : (
            <li className="text-start text-sm" data-testid={`${testId}-draft`}>
              {draft.updatedAt === null
                ? t('customForms.status.draft')
                : t('appTerms.draftRow', { date: date(draft.updatedAt) })}
              {draft.isSeenByTestPlayers ? (
                <span className="ms-2 rounded border border-dashed px-1.5 py-0.5 text-xs">
                  {t('draftSeenByTestPlayers')}
                </span>
              ) : null}
            </li>
          )}
          {groups.map((group) =>
            group.season === null ? (
              <Fragment key={group.key}>{rows(group.versions)}</Fragment>
            ) : (
              <li
                key={group.key}
                className="flex flex-col gap-1 pt-2"
                data-testid={`${testId}-season-${group.key}`}
              >
                <span className="text-start text-sm font-medium">
                  {group.season.name}
                  {group.season.isCurrent ? (
                    <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal">
                      {t('authorizationCurrentSeasonBadge')}
                    </span>
                  ) : null}
                </span>
                <ul className="flex flex-col gap-1 ps-3">{rows(group.versions)}</ul>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function VersionBadge({ label }: { readonly label: string }) {
  return <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-xs">{label}</span>;
}
