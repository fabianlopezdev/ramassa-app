/**
 * Her phone, drawn (RAPP-641): a frame in the Ramassà colours with one
 * onboarding screen in it, so staff spot its title, its questions and its
 * buttons. The board shows a miniature of the same screen on each card.
 *
 * Every control is drawn disabled: this is a picture, and the real screen is
 * checked on a phone with "Preview as player".
 *
 * The season authorization and the app terms draw their screens in the same
 * frame (RAPP-695), on their own boards since RAPP-696: one phone for every
 * form.
 */

import { QuestionControl } from '@/components/settings/question-type-fields';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ChevronDown, Files } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguageDirection } from '@ramassa/shared/i18n/languages';
import type { LanguageCode } from '@ramassa/shared/schemas';
import type { PhoneContent } from './screen-content';

export function PhoneFrame({
  content,
  language,
  step,
  total = 0,
  flowLabel,
  highlight,
}: {
  readonly content: PhoneContent;
  readonly language: LanguageCode;
  /** Her place in the flow; a screen outside a numbered flow leaves it out (RAPP-695). */
  readonly step?: number;
  readonly total?: number;
  /** The flow's name before the step, as the authorization's progress bar names it. */
  readonly flowLabel?: string;
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
        className="relative flex aspect-[9/19] flex-col overflow-hidden rounded-[2.2rem] bg-white text-foreground [overflow-wrap:anywhere]"
        data-testid="phone-screen"
      >
        <div aria-hidden className="flex h-8 shrink-0 items-center justify-center">
          <span className="h-5 w-20 rounded-full bg-(--ramassa-color-neutral-900)" />
        </div>
        {step === undefined ? null : (
          <div className="flex flex-col gap-2 px-5 pt-2">
            <div className="flex items-center justify-between gap-2">
              {flowLabel === undefined ? null : (
                <p className="min-w-0 truncate text-start text-[11px] font-semibold text-primary">
                  {flowLabel}
                </p>
              )}
              <p className="text-start text-[11px] font-medium text-muted-foreground tabular-nums">
                {phone('stepOf', { current: step, total })}
              </p>
            </div>
            <div aria-hidden className="h-1 overflow-hidden rounded-full bg-primary/15">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round((step / Math.max(total, 1)) * 100)}%` }}
              />
            </div>
          </div>
        )}
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
          {(content.sections ?? []).map((section, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-md bg-muted/60 p-3 text-start text-sm font-semibold"
            >
              <span className="min-w-0 flex-1">{section === '' ? ' ' : section}</span>
              <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </div>
          ))}
          {content.links === undefined || content.links.labels.length === 0 ? null : (
            <div className="flex flex-col gap-1.5">
              <p className="text-start text-base font-semibold">{content.links.title}</p>
              {content.links.labels.map((label, index) => (
                <p key={index} className="text-start text-sm font-medium text-primary underline">
                  {label}
                </p>
              ))}
            </div>
          )}
          {content.body === undefined ? null : (
            <p className="rounded-md bg-muted/60 p-3 text-start text-sm leading-5 whitespace-pre-line">
              {content.body}
            </p>
          )}
          {(content.blocks ?? []).map((block, index) => (
            <div key={index} className="flex flex-col gap-0.5">
              <p className="text-start text-sm font-semibold">{block.title}</p>
              <p className="text-start text-sm leading-5 text-muted-foreground">{block.body}</p>
            </div>
          ))}
          {(content.details ?? []).map((group, index) => (
            <div key={index} className="flex flex-col gap-1.5">
              <p className="text-start text-sm font-semibold">{group.title}</p>
              <div className="flex flex-col divide-y rounded-md border bg-background">
                {group.rows.map((row, at) => (
                  <div key={at} className="flex flex-col px-3 py-1.5">
                    <span className="text-start text-[11px] text-muted-foreground">
                      {row.label}
                    </span>
                    <span className="text-start text-sm">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {content.questions.map((question) => (
            <div
              key={question.id}
              className={cn(
                'flex flex-col gap-1.5 rounded-lg transition-[box-shadow]',
                highlight === question.id && 'ring-2 ring-primary ring-offset-4 ring-offset-canvas',
              )}
              data-testid={`phone-question-${question.id}`}
            >
              {question.heading === undefined ? null : (
                <p className="pb-1 text-start text-base font-semibold">{question.heading}</p>
              )}
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
              {question.isSignature === true ? (
                // A signature block (RAPP-690): her text above, the box she signs in.
                <PhoneSignatureBox prompt={phone('authorizationSignaturePrompt')} />
              ) : (
                <div inert className="pointer-events-none">
                  <QuestionControl
                    draft={question.draft}
                    language={language}
                    showOptionCount={false}
                  />
                </div>
              )}
            </div>
          ))}
          {content.lines.map((line, index) => (
            <p key={index} className="text-start text-sm leading-5 text-muted-foreground">
              {line}
            </p>
          ))}
          {content.checkbox === null ? null : (
            <PhoneTick label={content.checkbox} requiredMark={null} />
          )}
          {(content.checkboxes ?? []).map((checkbox, index) => (
            <PhoneTick key={index} label={checkbox.label} requiredMark={checkbox.requiredMark} />
          ))}
          {content.signatureTexts === undefined ? null : (
            <div className="flex flex-col gap-2">
              <p className="text-start text-base font-semibold">{content.signatureTexts.title}</p>
              <PhoneSignatureBox prompt={content.signatureTexts.prompt} />
              <PhoneTick label={content.signatureTexts.cannotDraw} requiredMark={null} />
            </div>
          )}
          {content.signature ? (
            <PhoneSignatureBox prompt={phone('authorizationSignaturePrompt')} />
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2 px-5 pt-2 pb-6">
          <span className="rounded-full bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground">
            {content.continueLabel === '' ? ' ' : content.continueLabel}
          </span>
          {content.secondaryLabel === undefined ? null : (
            <span className="rounded-full border border-primary px-4 py-2.5 text-center text-sm font-semibold text-primary">
              {content.secondaryLabel}
            </span>
          )}
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
 * The phone with a row of tabs above it when what is edited spans several
 * screens (RAPP-695): the screen editor's main and detail screens, the
 * authorization's steps, the terms' two screens. One component, so every
 * editor's preview is the same.
 */
export function SteppedPhone<Step extends string>({
  steps,
  shown,
  onShow,
  label,
  ...frame
}: ComponentProps<typeof PhoneFrame> & {
  /** The screens to pick from; with fewer than two, no tabs. */
  readonly steps: readonly { readonly value: Step; readonly label: string }[];
  readonly shown: Step;
  readonly onShow: (step: Step) => void;
  /** The tabs' name for assistive technology. */
  readonly label: string;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      {steps.length < 2 ? null : (
        <Tabs value={shown} onValueChange={(next) => onShow(next as Step)}>
          <TabsList aria-label={label} className="h-auto max-w-full flex-wrap justify-center">
            {steps.map((step) => (
              <TabsTrigger
                key={step.value}
                value={step.value}
                data-testid={`phone-step-${step.value}`}
              >
                {step.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <PhoneFrame {...frame} />
    </div>
  );
}

/** The empty box she signs in, its prompt inside. */
function PhoneSignatureBox({ prompt }: { readonly prompt: string }) {
  return (
    <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-input bg-background text-sm text-muted-foreground">
      {prompt}
    </div>
  );
}

/** A tick box and its words, with the required mark under them as her phone shows it. */
function PhoneTick({
  label,
  requiredMark,
}: {
  readonly label: string;
  readonly requiredMark: string | null;
}) {
  return (
    <div className="flex items-start gap-2 text-start text-sm">
      <span aria-hidden className="mt-0.5 size-4 shrink-0 rounded border-2 border-primary" />
      <span className="flex flex-col">
        <span>{label === '' ? ' ' : label}</span>
        {requiredMark === null ? null : <span className="font-semibold">{requiredMark}</span>}
      </span>
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
    <MiniatureFrame language={language} isDimmed={isDimmed}>
      <p className="line-clamp-2 text-start text-[11px] leading-4 font-semibold">{content.title}</p>
      {shown.length > 0 ? (
        <div className="flex flex-col gap-2">
          {shown.map((question) => (
            <div key={question.id} className="flex flex-col gap-1">
              <span className="truncate text-start text-[9px] leading-3 text-muted-foreground">
                {question.label}
                {question.isRequired ? <span className="text-primary"> *</span> : null}
              </span>
              <span className="h-5 rounded-[5px] border border-primary bg-white" />
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
    </MiniatureFrame>
  );
}

/** The 9:16 phone every card of a board draws, a screen's or a form's (RAPP-703). */
function MiniatureFrame({
  language,
  isDimmed,
  children,
}: {
  readonly language: LanguageCode;
  readonly isDimmed: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div
      aria-hidden
      lang={language}
      dir={getLanguageDirection(language)}
      className={cn(
        'flex aspect-[9/16] w-full flex-col gap-2 overflow-hidden rounded-xl border bg-white px-3 pt-3 pb-3 [overflow-wrap:anywhere]',
        isDimmed && 'opacity-50',
      )}
    >
      <div className="mx-auto h-1 w-8 shrink-0 rounded-full bg-foreground/15" />
      {children}
    </div>
  );
}

/**
 * A whole form as one card on the Onboarding board (RAPP-703): the app terms
 * and every form chained after Onboarding. It is the size of a screen's card
 * and draws no phone, because it stands for the form: its name, one line on
 * what kind it is, and how many screens it shows her.
 */
export function FormMiniature({
  name,
  kind,
  screens,
  language,
}: {
  readonly name: string;
  readonly kind: string;
  readonly screens: string;
  readonly language: LanguageCode;
}) {
  return (
    <div
      aria-hidden
      lang={language}
      dir={getLanguageDirection(language)}
      className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-3 rounded-xl border bg-muted/40 p-4 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Files className="size-6" />
      </span>
      <p className="line-clamp-3 text-sm leading-5 font-semibold">{name}</p>
      <p className="text-xs leading-4 text-muted-foreground">{kind}</p>
      <span className="rounded-full border bg-card px-2.5 py-1 text-xs leading-4 font-medium tabular-nums">
        {screens}
      </span>
    </div>
  );
}
