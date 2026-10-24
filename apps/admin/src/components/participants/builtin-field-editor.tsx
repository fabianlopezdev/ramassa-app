/**
 * Editing one of the app's own fields from her page (RAPP-653), through the
 * profile update path the full forms used:
 *
 *   - a joined player's record is saved whole, validated by the same schema
 *     her own edit screen uses (`profileEditSchema`, or the one without the
 *     Sensible fields for a reader who cannot see them): the database sets
 *     every column it is sent;
 *   - a woman who has not joined is completed in parts (RAPP-300): only what
 *     changed is sent, because each value sent becomes a team answer and her
 *     onboarding stops asking it.
 */

import {
  BuiltinFieldControls,
  type BuiltinEditKey,
} from '@/components/participants/builtin-field-controls';
import { Button } from '@/components/ui/button';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { AnsweredQuestions } from '@ramassa/shared/intake';
import {
  buildProfilePrefillPayload,
  prefillFromRow,
  profilePrefillSchema,
  type ParticipantDetailRow,
  type ProfilePrefill,
  type ProfilePrefillInput,
  type ProfilePrefillPayload,
} from '@ramassa/shared/participants';
import {
  buildUpdateOwnProfilePayload,
  profileEditSchema,
  profileEditWithoutSensitiveSchema,
  profileFromRow,
  type ProfileEdit,
  type UpdateOwnProfilePayload,
} from '@ramassa/shared/schemas';

type ProfileEditInput = z.input<typeof profileEditSchema>;

const fullResolver = zodResolver(profileEditSchema);
const withoutSensitiveResolver = zodResolver(profileEditWithoutSensitiveSchema);
const prefillResolver = zodResolver(profilePrefillSchema);

export interface BuiltinFieldEditorProps {
  readonly fieldKey: BuiltinEditKey;
  readonly participant: ParticipantDetailRow;
  /** What somebody answered, for a woman who has not joined; null once she joined. */
  readonly answered: AnsweredQuestions | null;
  readonly canSeeSensitive: boolean;
  readonly onSave: (payload: UpdateOwnProfilePayload | ProfilePrefillPayload) => Promise<void>;
  readonly onCancel: () => void;
}

export function BuiltinFieldEditor(props: BuiltinFieldEditorProps) {
  return props.answered === null ? (
    <JoinedFieldEditor {...props} />
  ) : (
    <InvitedFieldEditor {...props} answered={props.answered} />
  );
}

function JoinedFieldEditor({
  fieldKey,
  participant,
  canSeeSensitive,
  onSave,
  onCancel,
}: BuiltinFieldEditorProps) {
  const [message, setMessage] = useState<'blocked' | 'failed' | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileEditInput, unknown, ProfileEdit>({
    resolver: canSeeSensitive ? fullResolver : withoutSensitiveResolver,
    values: profileFromRow(participant) as ProfileEditInput,
  });
  const save = handleSubmit(
    async (edit) => {
      setMessage(null);
      try {
        await onSave(buildUpdateOwnProfilePayload(edit));
      } catch {
        setMessage('failed');
      }
    },
    // Another field of her record may be what does not pass: say it here.
    () => setMessage('blocked'),
  );
  return (
    <EditorForm
      onSubmit={() => void save()}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      message={message}
    >
      <BuiltinFieldControls
        fieldKey={fieldKey}
        control={control}
        errors={errors}
        canSeeSensitive={canSeeSensitive}
      />
    </EditorForm>
  );
}

function InvitedFieldEditor({
  fieldKey,
  participant,
  answered,
  canSeeSensitive,
  onSave,
  onCancel,
}: BuiltinFieldEditorProps & { readonly answered: AnsweredQuestions }) {
  const { t } = useTranslation('participants');
  const [message, setMessage] = useState<'blocked' | 'failed' | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<ProfilePrefillInput, unknown, ProfilePrefill>({
    resolver: prefillResolver,
    values: prefillFromRow(participant, answered),
  });
  const save = handleSubmit(
    async (values) => {
      setMessage(null);
      const payload = buildProfilePrefillPayload(values, new Set(Object.keys(dirtyFields)));
      if (Object.keys(payload).length === 0) {
        onCancel();
        return;
      }
      try {
        await onSave(payload);
      } catch {
        setMessage('failed');
      }
    },
    () => setMessage('blocked'),
  );
  return (
    <EditorForm
      onSubmit={() => void save()}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      message={message}
    >
      <BuiltinFieldControls
        fieldKey={fieldKey}
        control={control}
        errors={errors}
        canSeeSensitive={canSeeSensitive}
        emptyLabel={t('participants:prefillNotGiven')}
      />
    </EditorForm>
  );
}

/** The inputs, then Save and Cancel, and what went wrong next to them. */
export function EditorForm({
  children,
  onSubmit,
  onCancel,
  isSubmitting,
  message,
}: {
  readonly children: ReactNode;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly isSubmitting: boolean;
  readonly message: 'blocked' | 'failed' | string | null;
}) {
  const { t } = useTranslation('profile');
  const text =
    message === 'blocked'
      ? t('profile:saveBlocked')
      : message === 'failed'
        ? t('profile:saveFailed')
        : message;
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="grid gap-4 sm:max-w-md">{children}</div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {t('profile:saveAction')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t('profile:cancelAction')}
        </Button>
        {text === null ? null : (
          <p aria-live="polite" className="text-start text-sm text-destructive">
            {text}
          </p>
        )}
      </div>
    </form>
  );
}
