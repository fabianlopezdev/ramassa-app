/**
 * The team's notes about a participant, on her card (RAPP-282): read them,
 * newest first, with who wrote each one and when, and add one. The same notes
 * the web admin shows (`participant_notes`), behind the same permission
 * (`participants.notes`). Notes cannot be edited or deleted, and the screen
 * says so before anyone writes one.
 *
 * A new note is written in a sheet. On the card the keyboard covered the field
 * and its button, because the field sits low on a long card.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useParticipantNotes } from '@/lib/participant-lookup';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { noteAuthorName } from '@ramassa/shared/participants';
import { PARTICIPANT_NOTE_MAX_LENGTH, participantNoteSchema } from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

function NoteSheet({
  visible,
  onClose,
  addNote,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly addNote: ReturnType<typeof useParticipantNotes>['addNote'];
}) {
  const { t } = useTranslation('participants');
  const { t: tProfile } = useTranslation('profile');
  const fontClass = useLanguageFontClass();
  // A native Modal sits above the app lock's cover, so it hides while locked.
  const { isCovered } = useAppLock();
  const [draft, setDraft] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const close = () => {
    setValidationMessage(null);
    addNote.reset();
    onClose();
  };
  const submit = () => {
    const parsed = participantNoteSchema.safeParse({ body: draft });
    if (!parsed.success) {
      setValidationMessage(
        draft.trim() === ''
          ? t('noteRequired')
          : t('noteTooLong', { count: PARTICIPANT_NOTE_MAX_LENGTH }),
      );
      playHaptic('warning');
      return;
    }
    setValidationMessage(null);
    addNote.mutate(parsed.data.body, {
      onSuccess: () => {
        playHaptic('success');
        setDraft('');
        onClose();
      },
    });
  };

  return (
    <Modal
      visible={visible && !isCovered}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView className="flex-1 bg-white" testID="participant-note-sheet">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerClassName="gap-md p-lg" keyboardShouldPersistTaps="handled">
            <Text
              accessibilityRole="header"
              className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('sectionNotes')}
            </Text>
            <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
              {t('notesAppendOnly')}
            </Text>
            <AuthTextField
              testID="participant-note-input"
              label={t('noteAddLabel')}
              placeholder={t('noteAddPlaceholder')}
              value={draft}
              onChangeText={setDraft}
              maxLength={PARTICIPANT_NOTE_MAX_LENGTH}
              errorMessage={validationMessage ?? undefined}
              multiline
              autoFocus
            />
            {addNote.isError ? (
              <Text
                accessibilityLiveRegion="polite"
                className={`text-start text-sm text-error ${fontClass}`}
              >
                {t('noteAddFailed')}
              </Text>
            ) : null}
            <View className="flex-row flex-wrap gap-sm">
              <PressableScale
                testID="participant-note-add"
                accessibilityRole="button"
                accessibilityLabel={t('noteAddAction')}
                onPress={submit}
                isBusy={addNote.isPending}
                haptic="tapLight"
                style={continuousCorners}
                className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
              >
                <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
                  {t('noteAddAction')}
                </Text>
              </PressableScale>
              <PressableScale
                testID="participant-note-cancel"
                accessibilityRole="button"
                accessibilityLabel={tProfile('cancelAction')}
                onPress={close}
                haptic="tapLight"
                style={continuousCorners}
                className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 bg-white px-lg"
              >
                <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
                  {tProfile('cancelAction')}
                </Text>
              </PressableScale>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export function ParticipantNotes({ participantId }: { readonly participantId: string }) {
  const { t, i18n } = useTranslation('participants');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { notes, addNote } = useParticipantNotes(participantId);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const locale = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: MADRID_TIME_ZONE,
      }),
    [locale],
  );

  return (
    <View className="gap-sm" testID="participant-notes">
      <Text
        accessibilityRole="header"
        className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}
      >
        {t('sectionNotes')}
      </Text>
      <PressableScale
        testID="participant-note-open"
        accessibilityRole="button"
        accessibilityLabel={t('noteAddLabel')}
        onPress={() => setIsSheetOpen(true)}
        haptic="tapLight"
        style={continuousCorners}
        className="min-h-recommended items-center justify-center self-start rounded-md border border-neutral-300 bg-white px-lg"
      >
        <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
          {t('noteAddLabel')}
        </Text>
      </PressableScale>

      {notes.isPending ? (
        <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
      ) : notes.isError ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={tErrors('retry')}
          onPress={() => void notes.refetch()}
          haptic="tapLight"
          className="min-h-recommended justify-center self-start"
        >
          <Text className={`text-start text-sm text-error ${fontClass}`}>
            {`${t('profile.notesLoadFailed')} ${tErrors('retry')}`}
          </Text>
        </PressableScale>
      ) : notes.data.length === 0 ? (
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
          {t('notesEmpty')}
        </Text>
      ) : (
        <View className="gap-sm">
          {notes.data.map((note) => {
            const meta = `${noteAuthorName(note) ?? t('noteAuthorUnknown')} · ${format.format(
              new Date(note.created_at),
            )}`;
            return (
              <View
                key={note.id}
                testID="participant-note"
                accessible
                accessibilityLabel={`${note.body}. ${meta}`}
                className="gap-xs border-s-2 border-neutral-300 ps-md"
              >
                <Text selectable className={`text-start text-md text-neutral-900 ${fontClass}`}>
                  {note.body}
                </Text>
                <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>{meta}</Text>
              </View>
            );
          })}
        </View>
      )}
      <NoteSheet visible={isSheetOpen} onClose={() => setIsSheetOpen(false)} addNote={addNote} />
    </View>
  );
}
