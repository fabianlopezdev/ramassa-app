/**
 * The confirmation a staff member types before something irreversible happens
 * (RAPP-26).
 *
 * One component for both RGPD gestures, because the two dialogs differ in their
 * WORDS and not in their shape, and a second copy is how the erasure dialog ends
 * up with a safeguard the anonymization dialog quietly lost.
 *
 * WHY THE TYPED PHRASE IS A WORD AND NOT THE PARTICIPANT'S NAME
 *
 * Making the user type the record's own name is the stronger pattern in general:
 * it forces her to read WHICH record she is about to destroy. It is the wrong
 * pattern for this roster. These names are written in Arabic, Farsi and
 * Cyrillic, and a Catalan-speaking staff member on a Catalan keyboard cannot
 * type them at all, so the safeguard would either be defeated by copy-paste or
 * would block a legitimate erasure a woman has formally requested. An
 * anonymized record has no name left to type, which makes the pattern fail
 * exactly where it is needed most.
 *
 * So the phrase is a short word in the reader's own language, and the job the
 * name would have done is done by the dialog: it says her full name, in the
 * heading, and lists what is about to happen to it.
 *
 * The button stays DISABLED until the phrase matches. A disabled control is
 * honest here in a way it usually is not: there is no hidden validation to
 * discover, the requirement is stated above the field, and the alternative is a
 * button that looks ready and refuses.
 */

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Whether what was typed counts as the phrase.
 *
 * Case-insensitive and trimmed on purpose: this gate exists to stop a misclick,
 * not to test typing accuracy, and a staff member who typed the right word with
 * a capital letter has demonstrated exactly the deliberateness it is asking for.
 * Exported so the rule is unit-tested rather than inferred from the component.
 */
export function isConfirmationPhraseMatched(typed: string, expected: string): boolean {
  return typed.trim().toLocaleUpperCase() === expected.trim().toLocaleUpperCase();
}

export interface DestructiveConfirmProps {
  readonly title: string;
  readonly body: string;
  /** What this does, in plain language. Rendered as a list, never as a paragraph. */
  readonly consequences: readonly string[];
  readonly confirmationPhrase: string;
  readonly confirmLabel: string;
  readonly isWorking: boolean;
  readonly errorMessage?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** Anything the specific gesture needs to add, e.g. her outstanding request. */
  readonly children?: ReactNode;
}

export function DestructiveConfirm({
  title,
  body,
  consequences,
  confirmationPhrase,
  confirmLabel,
  isWorking,
  errorMessage,
  onConfirm,
  onCancel,
  children,
}: DestructiveConfirmProps) {
  const { t } = useTranslation(['participants', 'profile']);
  const [typed, setTyped] = useState('');
  const fieldId = useId();
  const isMatched = isConfirmationPhraseMatched(typed, confirmationPhrase);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isWorking) onCancel();
      }}
    >
      <DialogContent
        className="border-destructive"
        onEscapeKeyDown={(event) => {
          if (isWorking) event.preventDefault();
        }}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(fieldId)?.focus();
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{body}</DialogDescription>

        <ul className="flex list-disc flex-col gap-1 ps-5">
          {consequences.map((consequence) => (
            <li key={consequence} className="text-start text-sm">
              {consequence}
            </li>
          ))}
        </ul>

        {children}

        <p className="text-start text-sm font-medium text-destructive">
          {t('irreversibleWarning')}
        </p>

        <div className="flex flex-col gap-2">
          <label
            htmlFor={fieldId}
            className="flex flex-wrap items-center gap-2 text-start text-sm font-medium"
          >
            {t('confirmTypeLabel')}
            {/* The word in its own element rather than interpolated into the
              sentence: it is what the reader's eye has to land on, and it is
              what the browser suite reads instead of hardcoding a Catalan word
              that is not what an English or Arabic session shows. */}
            <code data-confirmation-phrase className="rounded bg-muted px-2 py-0.5 font-mono">
              {confirmationPhrase}
            </code>
          </label>
          <Input
            id={fieldId}
            value={typed}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
            className="max-w-xs"
          />
        </div>

        {errorMessage === undefined ? null : (
          <p aria-live="polite" className="text-start text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="lg"
            variant="destructive"
            disabled={!isMatched || isWorking}
            onClick={onConfirm}
          >
            {isWorking ? t('workingLabel') : confirmLabel}
          </Button>
          <DialogClose asChild>
            <Button type="button" size="lg" variant="outline" disabled={isWorking}>
              {t('profile:cancelAction')}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
