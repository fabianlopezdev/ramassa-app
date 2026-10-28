/**
 * Her record on the Fitxa layout (RAPP-653, RAPP-664): the Fitxa's sections in
 * their order, each field with her answer, who gave it and when, inline
 * editing by the team with one editor for every field. While she has not
 * joined, a sidebar holds her per-field registration choices. Below the
 * fields, her account: app
 * language, photo consent, terms and season, which are not Fitxa fields.
 *
 * Her choices plan through the shared `playerPlan`, the one the invitation's
 * board and her phone use, and save through `set_intake_question_states`
 * (only what changed), so the three never disagree.
 */

import { EditorSection } from '@/components/layout/editor-section';
import { ChoiceMenu } from '@/components/participants/choice-menu';
import { EditorForm } from '@/components/participants/field-answer-editor';
import { ParticipantCustomForms } from '@/components/participants/participant-custom-forms';
import { PlayerChoicesBar } from '@/components/participants/player-choices-bar';
import { ProfileAnswerRow } from '@/components/participants/profile-answer-row';
import { ProfileSection, type FitxaContext } from '@/components/participants/profile-section';
import { answersByField, fitxaSections, planQuestionsByField } from '@/lib/participant-fitxa';
import { cn } from '@/lib/utils';
import { ClipboardList, Settings } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n';
import type { IntakeQuestion, QuestionStates } from '@ramassa/shared/intake';
import {
  EMPTY_PROFILE_LAYOUT,
  playerPlan,
  textIn,
  withQuestionChoice,
  type CustomAnswers,
  type IntakeCatalog,
  type IntakePreset,
  type ParticipantCustomAnswer,
  type ParticipantCustomForm,
  type PlayerChoices,
} from '@ramassa/shared/intake-builder';
import {
  hasJoined,
  type ParticipantRecord,
  type ParticipantUpdate,
} from '@ramassa/shared/participants';
import type { PermissionCode } from '@ramassa/shared/permissions';
import type { LanguageCode } from '@ramassa/shared/schemas';

export interface ParticipantFitxaProps {
  readonly participant: ParticipantRecord;
  readonly catalog: IntakeCatalog;
  /** Her answers to every field, each season apart, by the reader's levels. */
  readonly customAnswers: readonly ParticipantCustomAnswer[];
  /** What somebody answered, for a woman who has not joined (RAPP-300). */
  readonly answeredQuestions: readonly IntakeQuestion[];
  /** Her saved choices (RAPP-301, RAPP-645). */
  readonly choices: PlayerChoices;
  /** Choices are shown: she has not joined, and this reader may set them. */
  readonly showChoices: boolean;
  readonly sees: (code: PermissionCode) => boolean;
  /** Her names, settings and answers by field; throws when the database refuses. */
  readonly onSave: (update: ParticipantUpdate) => Promise<void>;
  /** Throws when the database refuses, so the row keeps the saved choice. */
  readonly onSaveChoices: (next: PlayerChoices) => Promise<void>;
  readonly choicesError?: string;
  readonly onSavePreset: (name: string, states: QuestionStates) => Promise<void>;
  readonly onDeletePreset: (preset: IntakePreset) => void;
  readonly onOpenFile?: (objectKey: string) => Promise<void>;
  /** Her asks of the forms the team created (RAPP-700). */
  readonly customForms?: readonly ParticipantCustomForm[];
  readonly editingId: string | null;
  readonly onEditingChange: (id: string | null) => void;
}

export function ParticipantFitxa({
  participant,
  catalog,
  customAnswers,
  answeredQuestions,
  choices,
  showChoices,
  sees,
  onSave,
  onSaveChoices,
  choicesError,
  onSavePreset,
  onDeletePreset,
  onOpenFile,
  customForms = [],
  editingId,
  onEditingChange,
}: ParticipantFitxaProps) {
  const { t, i18n } = useTranslation(['participants', 'onboarding', 'profile', 'common']);
  const locale = i18n.resolvedLanguage ?? 'ca';
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
  const sections = fitxaSections(layout, answers, locale as LanguageCode);
  const questions = planQuestionsByField(plan, layout.fields);

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
    layout,
    answers,
    sees,
    canEdit: sees('participants.view_personal'),
    choices: null,
    isChoiceBusy,
    onChoice: (question, state) => void saveChoices(withQuestionChoice(choices, question, state)),
    editingId,
    onEditingChange,
    onSave,
    onOpenFile,
  };
  const accountRow = {
    lockedLevel: null,
    choice: null,
    hasChoiceColumn: false,
    source: null,
    onToggleEdit: () => undefined,
    isEditing: false,
    canEdit: false,
  } as const;
  const editable = (key: 'preferred_language' | 'media_consent') => ({
    canEdit: context.canEdit,
    isEditing: editingId === key,
    onToggleEdit: () => onEditingChange(editingId === key ? null : key),
    editor: (
      <AccountSettingEditor
        setting={key}
        participant={participant}
        onSave={async (update) => {
          await onSave(update);
          onEditingChange(null);
        }}
        onCancel={() => onEditingChange(null)}
      />
    ),
  });

  return (
    <div data-testid="participant-fitxa" className="flex flex-col gap-6">
      <div
        className={cn(
          'grid items-start gap-6',
          showChoices && 'xl:grid-cols-[minmax(0,1fr)_20rem]',
        )}
      >
        <div className="flex min-w-0 flex-col gap-6">
          {sections.map(({ section, fields }) => (
            <ProfileSection key={section.id} section={section} fields={fields} context={context} />
          ))}

          <ParticipantCustomForms forms={customForms} />

          <EditorSection
            title={t('participants:fitxa.accountTitle')}
            leading={<Settings aria-hidden className="size-5 text-primary" />}
            isFlush
            testId="fitxa-account"
          >
            <ul className="flex flex-col divide-y">
              <ProfileAnswerRow
                {...accountRow}
                {...editable('preferred_language')}
                name={t('profile:languageLabel')}
                value={t(`common:languageName.${participant.preferred_language}`)}
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
                testId="fitxa-field-terms"
              />
              <ProfileAnswerRow
                {...accountRow}
                name={t('onboarding:seasonNumberLabel')}
                value={
                  participant.season_number == null
                    ? null
                    : t(`onboarding:seasonNumber${participant.season_number}`)
                }
                testId="fitxa-field-season_number"
              />
            </ul>
          </EditorSection>
        </div>

        {showChoices ? (
          <aside className="flex min-w-0 flex-col gap-6">
            <EditorSection
              title={t('participants:profileDesign.registration')}
              leading={<ClipboardList aria-hidden className="size-5 text-primary" />}
              isFlush
              testId="profile-registration-choices"
            >
              <div className="flex flex-col divide-y">
                {sections.map(({ section, fields }) => {
                  const askedFields = fields.filter((field) => questions.has(field.id));
                  if (askedFields.length === 0) return null;
                  return (
                    <section key={section.id} className="px-5 py-4">
                      <h3 className="mb-3 text-start text-sm font-medium text-muted-foreground">
                        {textIn(section.title, locale as LanguageCode)}
                      </h3>
                      <ul className="flex flex-col gap-4">
                        {askedFields.map((field) => {
                          const question = questions.get(field.id);
                          if (question === undefined) return null;
                          return (
                            <li key={field.id} className="flex flex-col gap-1.5">
                              <span className="text-start text-sm">
                                {textIn(field.label, locale as LanguageCode)}
                              </span>
                              <ChoiceMenu
                                question={question}
                                name={textIn(field.label, locale as LanguageCode)}
                                isBusy={isChoiceBusy}
                                onChange={(state) =>
                                  void saveChoices(withQuestionChoice(choices, question, state))
                                }
                                testId={`fitxa-field-${field.builtinKey ?? field.systemKey ?? field.id}-choice`}
                              />
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </EditorSection>

            <details className="group rounded-xl border bg-card">
              <summary className="cursor-pointer px-5 py-4 text-start text-sm font-medium focus-visible:outline-ring">
                {t('participants:profileDesign.presets')}
              </summary>
              <div className="border-t p-3 [&>section]:border-0 [&>section]:shadow-none">
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
              </div>
            </details>
            {choicesError === undefined ? null : (
              <p role="alert" className="text-sm text-destructive">
                {choicesError}
              </p>
            )}
          </aside>
        ) : null}
      </div>
      <p className="text-start text-xs text-muted-foreground">{t('participants:accessLogged')}</p>
    </div>
  );
}

/** Her app language or her photo consent: settings on her account, never field answers. */
function AccountSettingEditor({
  setting,
  participant,
  onSave,
  onCancel,
}: {
  readonly setting: 'preferred_language' | 'media_consent';
  readonly participant: ParticipantRecord;
  readonly onSave: (update: ParticipantUpdate) => Promise<void>;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation(['profile', 'onboarding']);
  const [value, setValue] = useState(
    setting === 'preferred_language'
      ? participant.preferred_language
      : String(participant.media_consent),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const options =
    setting === 'preferred_language'
      ? SUPPORTED_LANGUAGES.map((language) => ({
          value: language,
          label: LANGUAGE_NATIVE_NAMES[language],
        }))
      : [
          { value: 'true', label: t('onboarding:yesOption') },
          { value: 'false', label: t('onboarding:noOption') },
        ];

  async function submit() {
    setIsSaving(true);
    setFailed(false);
    try {
      await onSave(
        setting === 'preferred_language'
          ? { preferred_language: value, answers: {} }
          : { media_consent: value === 'true', answers: {} },
      );
    } catch {
      setFailed(true);
    } finally {
      setIsSaving(false);
    }
  }

  const id = `fitxa-account-${setting}`;
  return (
    <EditorForm
      onSubmit={() => void submit()}
      onCancel={onCancel}
      isSubmitting={isSaving}
      message={failed ? t('profile:saveFailed') : null}
    >
      <label htmlFor={id} className="flex flex-col gap-1.5">
        <span className="text-start text-sm font-medium text-foreground">
          {setting === 'preferred_language'
            ? t('profile:languageLabel')
            : t('profile:fieldMediaConsent')}
        </span>
        <select
          id={id}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className={cn(
            'h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs',
            'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none',
          )}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </EditorForm>
  );
}
