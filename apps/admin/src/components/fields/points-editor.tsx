/**
 * A list of points, each a title and a text, in the language being edited
 * (RAPP-613, RAPP-770): the app terms' introduction and a points block of a
 * form screen. One to `APP_TERMS_MAX_POINTS` points; the last one stays.
 *
 * Controlled: the caller holds the points in all five languages and saves
 * them. "Add a point" is its own component, so an editor can put it where its
 * section shows actions.
 */

import { CONTROL_COLUMN } from '@/components/onboarding/screen-editor';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from 'react-i18next';
import { getLanguageDirection } from '@ramassa/shared/i18n/languages';
import { APP_TERMS_MAX_POINTS, type LocalizedPoint } from '@ramassa/shared/intake';
import type { LanguageCode } from '@ramassa/shared/schemas';

type PointText = LocalizedPoint['title'];

export function PointsEditor({
  points,
  language,
  onChange,
  idPrefix,
}: {
  readonly points: readonly LocalizedPoint[];
  /** The language being edited. */
  readonly language: LanguageCode;
  readonly onChange: (points: LocalizedPoint[]) => void;
  /** Keeps the ids of two editors on one page apart. */
  readonly idPrefix: string;
}) {
  const { t } = useTranslation('settings');
  const direction = getLanguageDirection(language);
  const withLanguage = (text: PointText, value: string): PointText => ({
    ...text,
    [language]: value,
  });
  const edit = (index: number, part: 'title' | 'body', value: string) =>
    onChange(
      points.map((entry, at) =>
        at === index ? { ...entry, [part]: withLanguage(entry[part], value) } : entry,
      ),
    );

  return (
    <div className="flex flex-col gap-3">
      {points.map((point, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-lg border p-4">
          <FieldGroup>
            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel htmlFor={`${idPrefix}-point-title-${index}`}>
                  {t('appTerms.pointTitle', { number: index + 1 })}
                </FieldLabel>
              </FieldContent>
              <div className={CONTROL_COLUMN}>
                <Input
                  id={`${idPrefix}-point-title-${index}`}
                  dir={direction}
                  lang={language}
                  value={point.title[language] ?? ''}
                  onChange={(event) => edit(index, 'title', event.target.value)}
                />
              </div>
            </Field>
            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel htmlFor={`${idPrefix}-point-body-${index}`}>
                  {t('appTerms.pointBody', { number: index + 1 })}
                </FieldLabel>
              </FieldContent>
              <div className={CONTROL_COLUMN}>
                <Textarea
                  id={`${idPrefix}-point-body-${index}`}
                  rows={2}
                  dir={direction}
                  lang={language}
                  value={point.body[language] ?? ''}
                  onChange={(event) => edit(index, 'body', event.target.value)}
                />
              </div>
            </Field>
          </FieldGroup>
          {points.length > 1 ? (
            <Button
              type="button"
              variant="outline"
              className="w-fit self-end"
              onClick={() => onChange(points.filter((_, at) => at !== index))}
            >
              {t('appTerms.removePoint')}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Whether the list has room for one more point. */
export function canAddPoint(points: readonly LocalizedPoint[]): boolean {
  return points.length < APP_TERMS_MAX_POINTS;
}

/** "Add a point", while the list has room for one more. */
export function AddPointButton({
  points,
  onChange,
}: {
  readonly points: readonly LocalizedPoint[];
  readonly onChange: (points: LocalizedPoint[]) => void;
}) {
  const { t } = useTranslation('settings');
  return canAddPoint(points) ? (
    <Button
      type="button"
      variant="outline"
      onClick={() => onChange([...points, { title: {}, body: {} }])}
    >
      {t('appTerms.addPoint')}
    </Button>
  ) : null;
}
