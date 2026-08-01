/**
 * The staff note thread on a participant (RAPP-24).
 *
 * Append-only, and the screen SAYS so. A note is the record of what the team
 * knew and when; if it could be quietly rewritten later it would be worth less
 * than no note at all. The database enforces this (no UPDATE and no DELETE
 * policy); this sentence is what stops a staff member writing something
 * provisional in the belief she can tidy it up afterwards.
 *
 * Every note is signed. An author the reader cannot resolve renders as
 * "unknown" in her own language rather than as a name this screen invented.
 */

import { DetailSection } from '@/components/detail/detail-section';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { noteAuthorName, type ParticipantNoteRow } from '@ramassa/shared/participants';
import { PARTICIPANT_NOTE_MAX_LENGTH, participantNoteSchema } from '@ramassa/shared/schemas';

export interface ParticipantNotesProps {
  readonly notes: readonly ParticipantNoteRow[];
  readonly onAdd: (body: string) => Promise<void>;
  /** Set when the write itself failed, as opposed to the note being invalid. */
  readonly errorMessage?: string;
}

export function ParticipantNotes({ notes, onAdd, errorMessage }: ParticipantNotesProps) {
  const { t, i18n } = useTranslation(['participants', 'common']);
  const locale = i18n.resolvedLanguage ?? 'ca';
  const [draft, setDraft] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // The same rule Postgres enforces on the column, checked here so a staff
    // member is told rather than having the write refused and surfaced as a
    // generic failure.
    const parsed = participantNoteSchema.safeParse({ body: draft });
    if (!parsed.success) {
      setValidationMessage(
        draft.trim() === ''
          ? t('noteRequired')
          : t('noteTooLong', { count: PARTICIPANT_NOTE_MAX_LENGTH }),
      );
      return;
    }
    setValidationMessage(null);
    setIsSaving(true);
    try {
      await onAdd(parsed.data.body);
      setDraft('');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <DetailSection title={t('sectionNotes')} description={t('notesAppendOnly')}>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col items-start gap-2">
        <label htmlFor="participant-note" className="text-start text-sm font-medium">
          {t('noteAddLabel')}
        </label>
        <Textarea
          id="participant-note"
          value={draft}
          rows={3}
          maxLength={PARTICIPANT_NOTE_MAX_LENGTH}
          placeholder={t('noteAddPlaceholder')}
          aria-invalid={validationMessage !== null}
          aria-describedby={validationMessage === null ? undefined : 'participant-note-error'}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={isSaving}>
            {t('noteAddAction')}
          </Button>
          {validationMessage === null ? null : (
            <p
              id="participant-note-error"
              aria-live="polite"
              className="text-start text-sm text-destructive"
            >
              {validationMessage}
            </p>
          )}
          {errorMessage === undefined ? null : (
            <p aria-live="polite" className="text-start text-sm text-destructive">
              {errorMessage}
            </p>
          )}
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="text-start text-sm text-muted-foreground">{t('notesEmpty')}</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {notes.map((note) => (
            <li key={note.id} className="flex flex-col gap-1 border-s-2 border-border ps-4">
              <p className="text-start text-sm whitespace-pre-wrap">{note.body}</p>
              <p className="text-start text-xs text-muted-foreground">
                {noteAuthorName(note) ?? t('noteAuthorUnknown')}
                {' · '}
                {new Date(note.created_at).toLocaleString(locale)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </DetailSection>
  );
}
