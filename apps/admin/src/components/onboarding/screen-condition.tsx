/**
 * Screens that depend on an answer of another screen (RAPP-715), in the
 * Control Center: one rule for every screen, the app's and the team's, on
 * Onboarding and on the forms the team creates.
 *
 *   - `ConditionFields`: the screen, its choice question and the answers that
 *     open the screen. "Afegeix una pantalla" asks them after "Depèn d'una
 *     resposta d'una altra pantalla?", and the editor's "Quan es mostra"
 *     section changes or removes them.
 *   - `FamilyRow`: at the top of a screen's editor, the screen and every
 *     follow-up below it as small phones, numbered as on the board (3, 3a,
 *     3a.1, 3b), each with its condition. One click opens it. A last +
 *     tile adds a screen that depends on the one being edited (RAPP-717).
 *
 * Only earlier screens are offered: the database refuses a later screen, the
 * screen itself and its own follow-ups.
 */

import { EditorSection } from '@/components/layout/editor-section';
import { useReload } from '@/components/settings/onboarding-design-sections';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { isConditionFieldType, type ScreenCondition } from '@ramassa/shared/intake';
import {
  fieldById,
  saveScreenCondition,
  textIn,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';
import type { AddDependent, BoardCardLink } from './screen-board';
import { conditionAnswers, type Translate } from './screen-content';

/** An earlier screen and the choice questions asked on it: what a screen can depend on. */
export interface ConditionSource {
  readonly key: string;
  readonly name: string;
  readonly number: string;
  readonly questions: readonly { readonly fieldId: string; readonly label: string }[];
}

/**
 * The screens of a form that ask a choice question, in her order, each with
 * those questions. `screenKey` turns a board key into the placements' screen
 * key (a team screen's id, an app screen's name).
 */
export function conditionSources(
  catalog: IntakeCatalog,
  keys: readonly string[],
  surface: 'onboarding' | 'custom_form',
  describe: (key: string) => {
    readonly name: string;
    readonly number: string;
    readonly screenKey: string;
  },
  language: LanguageCode,
): readonly ConditionSource[] {
  const layout = catalog.layout;
  if (layout === undefined) return [];
  return keys.flatMap((key) => {
    const { name, number, screenKey } = describe(key);
    const questions = layout.placements
      .filter((placement) => placement.surface === surface && placement.screenKey === screenKey)
      .flatMap((placement) => {
        const field = fieldById(layout, placement.fieldId);
        return field === undefined || field.isArchived || !isConditionFieldType(field.type)
          ? []
          : [{ fieldId: field.id, label: textIn(field.label, language) }];
      });
    return questions.length === 0 ? [] : [{ key, name, number, questions }];
  });
}

/** A condition being picked: the screen, its question and the answers. */
export interface ConditionDraft {
  readonly sourceKey: string | null;
  readonly fieldId: string | null;
  readonly values: readonly string[];
}

export const EMPTY_CONDITION: ConditionDraft = { sourceKey: null, fieldId: null, values: [] };

/** The condition to save, or null while the screen, the question or an answer is missing. */
export function completeCondition(draft: ConditionDraft): ScreenCondition | null {
  return draft.fieldId === null || draft.values.length === 0
    ? null
    : { fieldId: draft.fieldId, values: draft.values };
}

/** A saved condition as a draft, with the screen holding its question. */
function conditionDraftOf(
  condition: ScreenCondition | null,
  sources: readonly ConditionSource[],
): ConditionDraft {
  if (condition === null) return EMPTY_CONDITION;
  const source = sources.find((each) =>
    each.questions.some((question) => question.fieldId === condition.fieldId),
  );
  return { sourceKey: source?.key ?? null, fieldId: condition.fieldId, values: condition.values };
}

/** The screen, then its question, then one or more answers. */
export function ConditionFields({
  catalog,
  sources,
  isSourceFixed = false,
  draft,
  onChange,
  idPrefix,
}: {
  readonly catalog: IntakeCatalog;
  readonly sources: readonly ConditionSource[];
  /** The screen was chosen before (a card's or an editor's +, RAPP-717): only its question and answers are asked. */
  readonly isSourceFixed?: boolean;
  readonly draft: ConditionDraft;
  readonly onChange: (draft: ConditionDraft) => void;
  readonly idPrefix: string;
}) {
  const { t, i18n } = useTranslation(['settings']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const source = sources.find((each) => each.key === draft.sourceKey);
  const answers =
    draft.fieldId === null
      ? []
      : conditionAnswers(catalog, draft.fieldId, language, t as Translate, draft.values);
  if (sources.length === 0) {
    return <FieldDescription>{t('onboardingBoard.condition.noSources')}</FieldDescription>;
  }
  return (
    <FieldGroup className="gap-4" data-testid={`${idPrefix}-condition`}>
      {isSourceFixed ? null : (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-condition-screen`}>
            {t('onboardingBoard.condition.screen')}
          </FieldLabel>
          <Select
            value={draft.sourceKey ?? undefined}
            onValueChange={(key) => {
              // The hidden native select reports '' while its options are closed.
              if (key === '' || key === draft.sourceKey) return;
              const picked = sources.find((each) => each.key === key);
              onChange({
                sourceKey: key,
                // A screen with one choice question picks it.
                fieldId:
                  picked?.questions.length === 1 ? (picked.questions[0]?.fieldId ?? null) : null,
                values: [],
              });
            }}
          >
            <SelectTrigger
              id={`${idPrefix}-condition-screen`}
              className="w-full"
              data-testid={`${idPrefix}-condition-screen`}
            >
              <SelectValue placeholder={t('onboardingBoard.condition.pickScreen')} />
            </SelectTrigger>
            <SelectContent>
              {sources.map((each) => (
                <SelectItem key={each.key} value={each.key}>
                  {`${each.number}. ${each.name}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <Field data-disabled={source === undefined}>
        <FieldLabel htmlFor={`${idPrefix}-condition-question`}>
          {t('onboardingBoard.condition.question')}
        </FieldLabel>
        <Select
          value={draft.fieldId ?? undefined}
          disabled={source === undefined}
          onValueChange={(fieldId) => {
            if (fieldId === '' || fieldId === draft.fieldId) return;
            onChange({ ...draft, fieldId, values: [] });
          }}
        >
          <SelectTrigger
            id={`${idPrefix}-condition-question`}
            className="w-full"
            data-testid={`${idPrefix}-condition-question`}
          >
            <SelectValue placeholder={t('onboardingBoard.condition.pickQuestion')} />
          </SelectTrigger>
          <SelectContent>
            {(source?.questions ?? []).map((question) => (
              <SelectItem key={question.fieldId} value={question.fieldId}>
                {question.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {answers.length === 0 ? null : (
        <FieldSet>
          <FieldLegend variant="label">{t('onboardingBoard.condition.answers')}</FieldLegend>
          <FieldGroup className="gap-2" data-testid={`${idPrefix}-condition-answers`}>
            {answers.map((answer) => {
              const id = `${idPrefix}-condition-answer-${answer.value}`;
              const isChecked = draft.values.includes(answer.value);
              return (
                <Field key={answer.value} orientation="horizontal">
                  <Checkbox
                    id={id}
                    checked={isChecked}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...draft,
                        values:
                          checked === true
                            ? [...draft.values, answer.value]
                            : draft.values.filter((value) => value !== answer.value),
                      })
                    }
                    data-testid={id}
                  />
                  <FieldLabel htmlFor={id} className="font-normal">
                    {answer.label}
                  </FieldLabel>
                </Field>
              );
            })}
          </FieldGroup>
        </FieldSet>
      )}
    </FieldGroup>
  );
}

/**
 * "Quan es mostra" in a team screen's editor: the condition as one line, and
 * the screen, question and answers to change it. "Mostra-la sempre" removes
 * it. Saved at once, as the screen's hide switch is.
 */
export function ScreenConditionSection({
  catalog,
  screenId,
  condition,
  sources,
  isOrphan,
  line,
}: {
  readonly catalog: IntakeCatalog;
  readonly screenId: string;
  readonly condition: ScreenCondition | null;
  /** The earlier screens with a choice question. */
  readonly sources: readonly ConditionSource[];
  /** Its question is asked nowhere on its form any more. */
  readonly isOrphan: boolean;
  readonly line: string;
}) {
  const { t } = useTranslation('settings');
  const reload = useReload();
  const [draft, setDraft] = useState<ConditionDraft>(() => conditionDraftOf(condition, sources));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function store(next: ScreenCondition | null) {
    setIsSaving(true);
    try {
      await saveScreenCondition(supabase, screenId, next);
      await reload();
      toast.success(
        t(next === null ? 'onboardingBoard.condition.removed' : 'onboardingBoard.condition.saved'),
      );
    } catch {
      toast.error(t('onboardingBoard.condition.failed'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <EditorSection
      title={t('onboardingBoard.condition.title')}
      testId="screen-condition"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {condition === null ? null : (
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => {
                setDraft(EMPTY_CONDITION);
                void store(null);
              }}
              data-testid="screen-condition-remove"
            >
              {t('onboardingBoard.condition.remove')}
            </Button>
          )}
          <Button
            type="button"
            disabled={isSaving || sources.length === 0}
            onClick={() => {
              const next = completeCondition(draft);
              if (next === null) {
                setError(t('onboardingBoard.condition.incomplete'));
                return;
              }
              setError(null);
              void store(next);
            }}
            data-testid="screen-condition-save"
          >
            {t('onboardingBoard.condition.save')}
          </Button>
        </div>
      }
    >
      <FieldGroup>
        <FieldDescription className="text-start" data-testid="screen-condition-line">
          {condition === null ? t('onboardingBoard.condition.always') : line}
        </FieldDescription>
        {isOrphan ? (
          <FieldError data-testid="screen-condition-orphan">
            {t('onboardingBoard.condition.orphan')}
          </FieldError>
        ) : null}
        <ConditionFields
          catalog={catalog}
          sources={sources}
          draft={draft}
          onChange={(next) => {
            setDraft(next);
            setError(null);
          }}
          idPrefix="screen-edit"
        />
        {error === null ? null : <FieldError>{error}</FieldError>}
      </FieldGroup>
    </EditorSection>
  );
}

/** One screen of a family: its number, its condition, its picture and where it opens. */
export interface FamilyMember {
  readonly key: string;
  readonly number: string;
  readonly name: string;
  /** Empty for the screen at the top of the family. */
  readonly line: string;
  readonly depth: number;
  readonly picture: ReactNode;
  readonly link: BoardCardLink;
  readonly isCurrent: boolean;
}

/**
 * A screen and every follow-up below it, depth first, as a row of the
 * board's own small phones (RAPP-715). The one being edited is marked; a
 * click opens another. Shown only for a family of more than one screen.
 */
export function FamilyRow({ members }: { readonly members: readonly FamilyMember[] }) {
  const { t } = useTranslation('settings');
  if (members.length < 2) return null;
  return (
    <nav aria-label={t('onboardingBoard.condition.family')} data-testid="screen-family">
      <ol className="flex gap-3 overflow-x-auto pb-2">
        {members.map((member) => (
          <li key={member.key} className="w-32 shrink-0">
            <Link
              {...member.link}
              aria-current={member.isCurrent ? 'page' : undefined}
              aria-label={`${t('onboardingBoard.step', { number: member.number })}: ${member.name}`}
              className={cn(
                'flex h-full flex-col gap-2 rounded-xl border p-2 text-start transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                member.depth > 0 && 'border-dashed border-primary/40',
                member.isCurrent && 'border-solid border-primary bg-primary/5 ring-2 ring-primary',
              )}
              data-testid={`screen-family-${member.key}`}
            >
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {t('onboardingBoard.step', { number: member.number })}
              </span>
              <span className="line-clamp-2 h-8 text-xs leading-4 text-muted-foreground">
                {member.line}
              </span>
              {member.picture}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Under the phone preview of a screen's editor (RAPP-718): adds a screen that
 * depends on this one; the dialog asks which answers open it. Off, with the
 * reason on hover, for a screen with no question with options.
 */
export function AddDependentButton({ add }: { readonly add: AddDependent }) {
  const { t } = useTranslation('settings');
  const label = t('onboardingBoard.addDependent');
  const button = (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={!add.canAdd}
      onClick={add.open}
      data-testid="screen-add-dependent"
    >
      <Plus aria-hidden data-icon="inline-start" />
      {label}
    </Button>
  );
  if (add.canAdd) return <div className="w-full max-w-[20rem]">{button}</div>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button gets no hover: the wrapper carries the reason. */}
        <span
          className="flex w-full max-w-[20rem]"
          tabIndex={0}
          data-testid="screen-add-dependent-reason"
        >
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent>{add.reason}</TooltipContent>
    </Tooltip>
  );
}
