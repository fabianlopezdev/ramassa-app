/**
 * Her record on the Fitxa layout (RAPP-653): the Fitxa's sections in their
 * order, each field with her answer, who gave it and when, inline editing by
 * the team, and, while she has not joined, the per-player choice on each
 * field. Below them, her account: app language, photo consent, terms and
 * season, which are not Fitxa fields.
 *
 * Her choices plan through the shared `playerPlan`, the one the invitation's
 * board and her phone use, and save through `set_intake_question_states`
 * (only what changed), so the three never disagree.
 */

import { EditorSection } from '@/components/layout/editor-section';
import { answerSourceText } from '@/components/participants/answer-source';
import { builtinAnswerText } from '@/components/participants/builtin-answer-text';
import { BuiltinFieldEditor } from '@/components/participants/builtin-field-editor';
import { PlayerChoicesBar } from '@/components/participants/player-choices-bar';
import { ProfileAnswerRow } from '@/components/participants/profile-answer-row';
import { ProfileSection, type FitxaContext } from '@/components/participants/profile-section';
import { answersByField, fitxaSections, planQuestionsByField } from '@/lib/participant-fitxa';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IntakeQuestion, QuestionStates } from '@ramassa/shared/intake';
import {
  EMPTY_PROFILE_LAYOUT,
  playerPlan,
  withQuestionChoice,
  type CustomAnswers,
  type CustomAnswerValue,
  type IntakeCatalog,
  type IntakePreset,
  type ParticipantCustomAnswer,
  type PlayerChoices,
} from '@ramassa/shared/intake-builder';
import {
  hasJoined,
  type ParticipantDetailRow,
  type ProfileAnswerOrigin,
  type ProfilePrefillPayload,
} from '@ramassa/shared/participants';
import type { PermissionCode } from '@ramassa/shared/permissions';
import type { LanguageCode, UpdateOwnProfilePayload } from '@ramassa/shared/schemas';

export interface ParticipantFitxaProps {
  readonly participant: ParticipantDetailRow;
  readonly catalog: IntakeCatalog;
  readonly customAnswers: readonly ParticipantCustomAnswer[];
  readonly origins: readonly ProfileAnswerOrigin[];
  /** What somebody answered, for a woman who has not joined (RAPP-300). */
  readonly answeredQuestions: readonly IntakeQuestion[];
  /** Her saved choices (RAPP-301, RAPP-645). */
  readonly choices: PlayerChoices;
  /** Choices are shown: she has not joined, and this reader may set them. */
  readonly showChoices: boolean;
  readonly sees: (code: PermissionCode) => boolean;
  readonly onSaveBuiltin: (
    payload: UpdateOwnProfilePayload | ProfilePrefillPayload,
  ) => Promise<void>;
  readonly onSaveCustom: (fieldId: string, value: CustomAnswerValue | null) => Promise<void>;
  /** Throws when the database refuses, so the row keeps the saved choice. */
  readonly onSaveChoices: (next: PlayerChoices) => Promise<void>;
  readonly choicesError?: string;
  readonly onSavePreset: (name: string, states: QuestionStates) => Promise<void>;
  readonly onDeletePreset: (preset: IntakePreset) => void;
  readonly onOpenFile?: (objectKey: string) => Promise<void>;
}

export function ParticipantFitxa({
  participant,
  catalog,
  customAnswers,
  origins,
  answeredQuestions,
  choices,
  showChoices,
  sees,
  onSaveBuiltin,
  onSaveCustom,
  onSaveChoices,
  choicesError,
  onSavePreset,
  onDeletePreset,
  onOpenFile,
}: ParticipantFitxaProps) {
  const { t, i18n } = useTranslation(['participants', 'onboarding', 'profile', 'common']);
  const locale = i18n.resolvedLanguage ?? 'ca';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isChoiceBusy, setIsChoiceBusy] = useState(false);
  const joined = hasJoined(participant);
  const layout = catalog.layout ?? EMPTY_PROFILE_LAYOUT;
  const answers = useMemo(() => answersByField(customAnswers), [customAnswers]);
  const answered = useMemo(() => new Set(answeredQuestions), [answeredQuestions]);
  // Her answers outside any season decide what Auto asks, as on her phone.
  const wizardAnswers: CustomAnswers = useMemo(
    () =>
      Object.fromEntries(
        customAnswers
          .filter((answer) => answer.seasonId === null)
          .map((answer) => [answer.questionId, answer.value]),
      ),
    [customAnswers],
  );
  const plan = playerPlan(catalog, answered, choices, wizardAnswers);
  const sections = fitxaSections(layout, new Set(answers.keys()), locale as LanguageCode);

  async function saveChoices(next: PlayerChoices) {
    setIsChoiceBusy(true);
    try {
      await onSaveChoices(next);
    } catch {
      // The page says why.
    } finally {
      setIsChoiceBusy(false);
    }
  }

  const context: FitxaContext = {
    participant,
    layout,
    answers,
    origins: new Map(origins.map((origin) => [origin.question, origin])),
    answered: joined ? null : answered,
    sees,
    canEdit: sees('participants.view_personal'),
    choices: showChoices ? planQuestionsByField(plan, layout.fields) : null,
    isChoiceBusy,
    onChoice: (question, state) => void saveChoices(withQuestionChoice(choices, question, state)),
    editingId,
    onEditingChange: setEditingId,
    onSaveBuiltin,
    onSaveCustom,
    onOpenFile,
  };
  const originText = (question: string) => {
    const origin = context.origins.get(question);
    return origin === undefined ? null : answerSourceText(origin, t, locale);
  };
  const accountRow = {
    lockedLevel: null,
    choice: null,
    hasChoiceColumn: showChoices,
    onToggleEdit: () => undefined,
    isEditing: false,
    canEdit: false,
  } as const;
  const editable = (key: 'preferred_language' | 'media_consent') => ({
    canEdit: context.canEdit,
    isEditing: editingId === key,
    onToggleEdit: () => setEditingId(editingId === key ? null : key),
    editor: (
      <BuiltinFieldEditor
        fieldKey={key}
        participant={participant}
        answered={context.answered}
        canSeeSensitive={sees('participants.view_sensitive')}
        onSave={async (payload) => {
          await onSaveBuiltin(payload);
          setEditingId(null);
        }}
        onCancel={() => setEditingId(null)}
      />
    ),
  });

  return (
    <div className="flex flex-col gap-6" data-testid="participant-fitxa">
      {/* Said out loud: reading this record wrote an audit row naming this
          staff member and this moment. */}
      <p className="text-start text-sm text-muted-foreground">{t('participants:accessLogged')}</p>

      {showChoices ? (
        <PlayerChoicesBar
          plan={plan}
          catalog={catalog}
          choices={choices}
          isBusy={isChoiceBusy}
          errorMessage={choicesError}
          onChange={(next) => void saveChoices(next)}
          onSavePreset={onSavePreset}
          onDeletePreset={onDeletePreset}
        />
      ) : null}

      {sections.map(({ section, fields }) => (
        <ProfileSection key={section.id} section={section} fields={fields} context={context} />
      ))}

      <EditorSection title={t('participants:fitxa.accountTitle')} isFlush testId="fitxa-account">
        <ul className="flex flex-col divide-y">
          <ProfileAnswerRow
            {...accountRow}
            {...editable('preferred_language')}
            name={t('profile:languageLabel')}
            value={builtinAnswerText('preferred_language', participant, t, locale)}
            source={originText('preferred_language')}
            testId="fitxa-field-preferred_language"
          />
          <ProfileAnswerRow
            {...accountRow}
            // The consent is hers to give before she joins (RAPP-300).
            {...(joined ? editable('media_consent') : {})}
            name={t('profile:fieldMediaConsent')}
            value={
              participant.media_consent
                ? t('participants:mediaConsentGranted')
                : t('participants:mediaConsentDenied')
            }
            source={null}
            testId="fitxa-field-media_consent"
          />
          <ProfileAnswerRow
            {...accountRow}
            name={t('onboarding:termsTitle')}
            value={
              participant.terms_accepted_at === null
                ? null
                : t('participants:termsAcceptedOn', {
                    date: new Date(participant.terms_accepted_at).toLocaleDateString(locale),
                  })
            }
            source={null}
            testId="fitxa-field-terms"
          />
          <ProfileAnswerRow
            {...accountRow}
            name={t('onboarding:seasonNumberLabel')}
            value={builtinAnswerText('season_number', participant, t, locale)}
            source={originText('season_number')}
            testId="fitxa-field-season_number"
          />
        </ul>
      </EditorSection>
    </div>
  );
}
