/**
 * Her phone, drawn (RAPP-641): a frame in the Ramassà colours with one
 * onboarding screen in it, so staff spot its title, its questions and its
 * buttons. The board shows a miniature of the same screen on each card.
 *
 * Every control is drawn disabled: this is a picture, and the real screen is
 * checked on a phone with "Preview as player".
 */

import { QuestionControl } from '@/components/settings/question-type-fields';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { getLanguageDirection } from '@ramassa/shared/i18n/languages';
import type { LanguageCode } from '@ramassa/shared/schemas';
import type { PhoneContent } from './screen-content';

export function PhoneFrame({
  content,
  language,
  step,
  total,
  highlight,
}: {
  readonly content: PhoneContent;
  readonly language: LanguageCode;
  readonly step: number;
  readonly total: number;
  /** The question an open form is editing, marked on the phone. */
  readonly highlight?: string;
}) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const phone = (key: string, options: Record<string, unknown> = {}) =>
    t(`onboarding:${key}`, { ...options, lng: language });
  return (
    <div
      className="mx-auto w-full max-w-[20rem] rounded-[2.75rem] bg-(--ramassa-color-neutral-900) p-2.5 shadow-xl ring-1 ring-black/10"
      data-testid="phone-preview"
    >
      <div
        lang={language}
        dir={getLanguageDirection(language)}
        className="relative flex aspect-[9/19] flex-col overflow-hidden rounded-[2.2rem] bg-canvas text-foreground"
      >
        <div aria-hidden className="flex h-8 shrink-0 items-center justify-center">
          <span className="h-5 w-20 rounded-full bg-(--ramassa-color-neutral-900)" />
        </div>
        <div className="flex flex-col gap-2 px-5 pt-2">
          <p className="text-start text-[11px] font-medium text-muted-foreground tabular-nums">
            {phone('stepOf', { current: step, total })}
          </p>
          <div aria-hidden className="h-1 overflow-hidden rounded-full bg-primary/15">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round((step / Math.max(total, 1)) * 100)}%` }}
            />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-5 pb-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-start text-xl leading-7 font-semibold" data-testid="phone-title">
              {content.title === '' ? ' ' : content.title}
            </p>
            {content.intro === '' ? null : (
              <p className="text-start text-sm leading-5 text-muted-foreground">{content.intro}</p>
            )}
            {content.help === '' ? null : (
              <p className="text-start text-sm leading-5">{content.help}</p>
            )}
          </div>
          {content.questions.map((question) => (
            <div
              key={question.id}
              className={cn(
                'flex flex-col gap-1.5 rounded-lg transition-[box-shadow]',
                highlight === question.id && 'ring-2 ring-primary ring-offset-4 ring-offset-canvas',
              )}
              data-testid={`phone-question-${question.id}`}
            >
              <p className="text-start text-sm font-medium">
                {question.label === '' ? ' ' : question.label}
                {question.isRequired ? (
                  <span className="text-primary" aria-label={t('onboardingBoard.required')}>
                    {' *'}
                  </span>
                ) : null}
              </p>
              {question.help === '' ? null : (
                <p className="text-start text-xs text-muted-foreground">{question.help}</p>
              )}
              <div inert className="pointer-events-none">
                <QuestionControl
                  draft={question.draft}
                  language={language}
                  showOptionCount={false}
                />
              </div>
            </div>
          ))}
          {content.lines.map((line, index) => (
            <p key={index} className="text-start text-sm leading-5 text-muted-foreground">
              {line}
            </p>
          ))}
          {content.checkbox === null ? null : (
            <div className="flex items-start gap-2 text-start text-sm">
              <span
                aria-hidden
                className="mt-0.5 size-4 shrink-0 rounded border-2 border-primary"
              />
              <span>{content.checkbox}</span>
            </div>
          )}
          {content.signature ? (
            <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-input bg-background text-sm text-muted-foreground">
              {phone('authorizationSignaturePrompt')}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2 px-5 pt-2 pb-6">
          <span className="rounded-full bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground">
            {content.continueLabel === '' ? ' ' : content.continueLabel}
          </span>
          {content.declineLabel === null ? null : (
            <span className="text-center text-sm font-medium text-primary">
              {content.declineLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The card's picture of a screen: its title, the first questions as label
 * and box, and the button. Text stands in as short lines where a screen
 * shows no question.
 */
export function PhoneMiniature({
  content,
  language,
  isDimmed = false,
}: {
  readonly content: PhoneContent;
  readonly language: LanguageCode;
  readonly isDimmed?: boolean;
}) {
  const shown = content.questions.slice(0, 3);
  return (
    <div
      aria-hidden
      lang={language}
      dir={getLanguageDirection(language)}
      className={cn(
        'flex aspect-[9/16] w-full flex-col gap-2 overflow-hidden rounded-xl border bg-canvas px-3 pt-3 pb-3',
        isDimmed && 'opacity-50',
      )}
    >
      <div className="mx-auto h-1 w-8 shrink-0 rounded-full bg-foreground/15" />
      <p className="line-clamp-2 text-start text-[11px] leading-4 font-semibold">{content.title}</p>
      {shown.length > 0 ? (
        <div className="flex flex-col gap-2">
          {shown.map((question) => (
            <div key={question.id} className="flex flex-col gap-1">
              <span className="truncate text-start text-[9px] leading-3 text-muted-foreground">
                {question.label}
                {question.isRequired ? <span className="text-primary"> *</span> : null}
              </span>
              <span className="h-4 rounded-[5px] border border-input bg-background" />
            </div>
          ))}
          {content.questions.length > shown.length ? (
            <span className="flex gap-0.5 ps-0.5">
              {[0, 1, 2].map((dot) => (
                <span key={dot} className="size-1 rounded-full bg-foreground/25" />
              ))}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 pt-0.5">
          {['w-full', 'w-11/12', 'w-4/5', 'w-2/3'].map((width) => (
            <span key={width} className={cn('h-1.5 rounded-full bg-foreground/10', width)} />
          ))}
        </div>
      )}
      <span className="mt-auto truncate rounded-full bg-primary px-2 py-1 text-center text-[9px] leading-3 font-semibold text-primary-foreground">
        {content.continueLabel === '' ? ' ' : content.continueLabel}
      </span>
    </div>
  );
}
