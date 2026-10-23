/**
 * One onboarding screen's editor (RAPP-641), opened from its card on the
 * registration board. The form sits on the start side and her phone on the
 * end side, drawn from what staff type before they save.
 *
 *   - A Ramassà screen: its title and intro, and its questions (type,
 *     required, order, wording), with the question builder's own forms
 *     (RAPP-307, RAPP-610, RAPP-611). It is deleted (archived) here.
 *   - An app screen: its wording per language and its hide switch (RAPP-612),
 *     and its questions reworded, hidden or made required. The document screen
 *     adds its note (RAPP-302), and a screen with a detail screen edits that
 *     one's wording too.
 *   - The terms and the season authorization keep their own editors
 *     (RAPP-613, RAPP-614), under the screen's wording.
 *
 * The form writes in one language at a time; the phone has its own language
 * switch, Arabic and Farsi right to left.
 */

import { Page, PageHeader } from '@/components/layout/page';
import {
  OnboardingAppTermsSection,
  OnboardingAuthorizationSection,
  OnboardingDocumentSection,
  useReload,
} from '@/components/settings/onboarding-design-sections';
import {
  BuiltinForm,
  EditingLanguageContext,
  QuestionForm,
  type BuiltinQuestionInfo,
} from '@/components/settings/question-builder';
import type { PreviewDraft } from '@/components/settings/question-type-fields';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { builtinQuestionOptions, QUESTION_LABEL_KEYS } from '@/lib/builtin-questions';
import { mediaWorkerUrl } from '@/lib/media-worker';
import type { OnboardingDesignData } from '@/lib/onboarding-design';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { ChevronLeft, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getLanguageDirection, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import {
  BUNDLED_SCREEN_TEXT_KEYS,
  DETAIL_SCREEN_PARENTS,
  isRequiredQuestion,
  screenTextFields,
  SEASON_WIZARD_SCREENS,
  WIZARD_QUESTION_SCREENS,
  WIZARD_SCREEN_QUESTIONS,
  type EditableWizardScreen,
  type IntakeQuestion,
  type ScreenTextField,
  type WizardQuestionScreen,
} from '@ramassa/shared/intake';
import {
  archiveCustomQuestion,
  archiveIntakeScreen,
  builtinRequiredLock,
  canHideBuiltin,
  canHideBuiltinScreen,
  canRequireCustomQuestion,
  ensureBuiltinScreenHolder,
  hasRequiredAddedQuestion,
  holderOf,
  isAskedOfHer,
  isCustomQuestionRequired,
  overrideFor,
  reorderCustomQuestions,
  requiredBuiltinQuestions,
  saveBuiltinOverride,
  saveBuiltinQuestionRequired,
  saveBuiltinScreen,
  saveCustomQuestion,
  saveCustomQuestionRequired,
  saveIntakeScreen,
  screenSettingsFor,
  textIn,
  uploadsAvailable,
  type BuilderText,
  type CustomQuestion,
  type IntakeCatalog,
  type IntakeScreen,
  type QuestionDraft,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { allSteps, editableScreenOf, stepFromRouteId, type BoardStep } from './board-steps';
import { LanguageTabs } from './language-tabs';
import { PhoneFrame } from './phone-preview';
import { stepName } from './screen-board';
import {
  builtinPhoneQuestion,
  builtinWording,
  customPhoneQuestion,
  draftPhoneQuestion,
  stepContent,
  type PhoneContent,
  type PhoneQuestion,
  type ScreenTexts,
} from './screen-content';

/** The control column of a setting row, as on the account page: one width, natural controls. */
const CONTROL_COLUMN = 'flex w-full flex-col gap-2 @md/field-group:w-100!';

/** A new question in the editor's phone, before it has an id. */
const NEW_QUESTION = 'new';

export function ScreenEditor({
  data,
  routeId,
}: {
  readonly data: OnboardingDesignData;
  readonly routeId: string;
}) {
  const { t, i18n } = useTranslation(['settings', 'onboarding']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const catalog = data.intakeCatalog;
  const step = stepFromRouteId(catalog, routeId);
  const steps = allSteps(catalog);
  const number = step === null ? 0 : steps.findIndex((each) => each.key === step.key) + 1;

  return (
    <Page data-testid="screen-editor-page">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="-ms-2.5 w-fit text-muted-foreground">
          <Link to="/onboarding" data-testid="screen-editor-back">
            <ChevronLeft aria-hidden data-icon="inline-start" className="rtl:rotate-180" />
            {t('onboardingPage.title')}
          </Link>
        </Button>
        {step === null ? (
          <PageHeader title={t('onboardingBoard.notFound')} />
        ) : (
          <EditorHeader
            step={step}
            name={stepName(step, language, t)}
            position={t('onboardingBoard.stepOf', { number, total: steps.length })}
          />
        )}
      </div>
      {step === null ? null : (
        // Keyed by the screen: another screen starts from what is saved.
        <EditorBody key={step.key} data={data} step={step} number={number} total={steps.length} />
      )}
    </Page>
  );
}

function EditorHeader({
  step,
  name,
  position,
}: {
  readonly step: BoardStep;
  readonly name: string;
  readonly position: string;
}) {
  return (
    <PageHeader
      title={name}
      description={position}
      actions={step.kind === 'custom' ? <DeleteScreen screen={step.screen} name={name} /> : null}
    />
  );
}

function DeleteScreen({ screen, name }: { readonly screen: IntakeScreen; readonly name: string }) {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  async function remove() {
    try {
      // Archived: her answers stay with the screen (RAPP-307).
      await archiveIntakeScreen(supabase, screen.id);
      await navigate({ to: '/onboarding' });
      await router.invalidate();
      toast.success(t('onboardingBoard.deleted', { screen: name }));
    } catch {
      toast.error(t('onboardingBoard.deleteFailed'));
    }
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={() => setIsOpen(true)}
        data-testid="screen-delete"
      >
        <Trash2 aria-hidden data-icon="inline-start" />
        {t('onboardingBoard.deleteScreen')}
      </Button>
      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title={t('onboardingBoard.deleteScreenTitle')}
        description={t('onboardingBoard.deleteScreenBody')}
        action={t('onboardingBoard.delete')}
        onConfirm={() => void remove()}
      />
    </>
  );
}

function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  action,
  onConfirm,
}: {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly action: string;
  readonly onConfirm: () => void;
}) {
  const { t } = useTranslation('settings');
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('onboardingBoard.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} data-testid="confirm-delete">
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The two columns: the form, and her phone kept in view while the form scrolls. */
function EditorColumns({
  language,
  onLanguageChange,
  previewLanguage,
  onPreviewLanguageChange,
  form,
  phone,
}: {
  readonly language: LanguageCode;
  readonly onLanguageChange: (language: LanguageCode) => void;
  readonly previewLanguage: LanguageCode;
  readonly onPreviewLanguageChange: (language: LanguageCode) => void;
  readonly form: ReactNode;
  readonly phone: ReactNode;
}) {
  const { t } = useTranslation('settings');
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,56rem)_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <LanguageTabs
          value={language}
          onChange={(next) => {
            onLanguageChange(next);
            // The phone follows, so staff see what they type; its own switch stays free.
            onPreviewLanguageChange(next);
          }}
          label={t('onboardingBoard.editingLanguage')}
          testId="editor-language"
        />
        <EditingLanguageContext.Provider value={language}>{form}</EditingLanguageContext.Provider>
      </div>
      <aside
        className="flex flex-col items-center gap-6 lg:sticky lg:top-6"
        aria-label={t('onboardingBoard.phone')}
      >
        <LanguageTabs
          value={previewLanguage}
          onChange={onPreviewLanguageChange}
          label={t('onboardingBoard.phoneLanguage')}
          testId="phone-language"
        />
        {phone}
      </aside>
    </div>
  );
}

function EditorSection({
  title,
  actions,
  footer,
  children,
  testId,
}: {
  readonly title: string;
  readonly actions?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
  readonly testId?: string;
}) {
  return (
    <section className="rounded-xl border bg-card" data-testid={testId}>
      <header className="flex min-h-14 items-center justify-between gap-3 border-b px-5 py-3">
        <h2 className="text-start text-base font-semibold">{title}</h2>
        {actions}
      </header>
      <div className="p-5">{children}</div>
      {footer === undefined ? null : (
        <footer className="flex items-center justify-end gap-2 border-t px-5 py-3">{footer}</footer>
      )}
    </section>
  );
}

function EditorBody({
  data,
  step,
  number,
  total,
}: {
  readonly data: OnboardingDesignData;
  readonly step: BoardStep;
  readonly number: number;
  readonly total: number;
}) {
  if (step.kind === 'custom') {
    return (
      <CustomScreenEditor
        data={data}
        screen={step.screen}
        step={step}
        number={number}
        total={total}
      />
    );
  }
  return <AppScreenEditor data={data} step={step} number={number} total={total} />;
}

// A Ramassà screen -----------------------------------------------------------------------------

function CustomScreenEditor({
  data,
  screen,
  step,
  number,
  total,
}: {
  readonly data: OnboardingDesignData;
  readonly screen: IntakeScreen;
  readonly step: BoardStep;
  readonly number: number;
  readonly total: number;
}) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const catalog = data.intakeCatalog;
  const reload = useReload();
  const [language, setLanguage] = useState<LanguageCode>('ca');
  const [previewLanguage, setPreviewLanguage] = useState<LanguageCode>('ca');
  const [title, setTitle] = useState<BuilderText>(screen.title);
  const [intro, setIntro] = useState<BuilderText>(screen.intro ?? {});
  const [isSaving, setIsSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<PreviewDraft | null>(null);
  const { ordered, reorder } = useQuestionOrder(
    screen.id,
    screen.questions.filter((question) => !question.isArchived),
  );

  async function saveScreen() {
    if ((title.ca ?? '').trim() === '') {
      setLanguage('ca');
      toast.error(t('questions.catalanNeeded'));
      return;
    }
    setIsSaving(true);
    try {
      await saveIntakeScreen(supabase, {
        id: screen.id,
        title,
        intro: Object.values(intro).some((value) => (value ?? '').trim() !== '') ? intro : null,
        afterScreen: screen.afterScreen,
      });
      await reload();
      toast.success(t('onboardingBoard.saved'));
    } catch {
      toast.error(t('builtinScreens.failed'));
    } finally {
      setIsSaving(false);
    }
  }

  const close = () => {
    setEditing(null);
    setDraft(null);
  };

  // Her phone: the questions she is asked, the one being edited as typed.
  const phoneQuestions: PhoneQuestion[] = ordered.flatMap((question) => {
    if (question.id === editing && draft !== null) {
      return [
        draftPhoneQuestion(question.id, draft, previewLanguage, isCustomQuestionRequired(question)),
      ];
    }
    return isAskedOfHer(question) ? [customPhoneQuestion(question, previewLanguage)] : [];
  });
  if (editing === NEW_QUESTION && draft !== null) {
    phoneQuestions.push(draftPhoneQuestion(NEW_QUESTION, draft, previewLanguage, false));
  }
  const content = stepContent(catalog, step, previewLanguage, t, {
    title,
    intro,
    questions: phoneQuestions,
  });

  const direction = getLanguageDirection(language);
  return (
    <EditorColumns
      language={language}
      onLanguageChange={setLanguage}
      previewLanguage={previewLanguage}
      onPreviewLanguageChange={setPreviewLanguage}
      phone={
        <PhoneFrame
          content={content}
          language={previewLanguage}
          step={number}
          total={total}
          highlight={editing ?? undefined}
        />
      }
      form={
        <>
          <EditorSection
            title={t('onboardingBoard.screen')}
            testId="screen-texts"
            footer={
              <Button
                type="button"
                disabled={isSaving}
                onClick={() => void saveScreen()}
                data-testid="screen-save"
              >
                {t('questions.saveScreen')}
              </Button>
            }
          >
            <FieldGroup>
              <Field orientation="responsive">
                <FieldContent>
                  <FieldLabel htmlFor="screen-title">{t('questions.screenTitle')}</FieldLabel>
                </FieldContent>
                <div className={CONTROL_COLUMN}>
                  <Input
                    id="screen-title"
                    dir={direction}
                    lang={language}
                    value={title[language] ?? ''}
                    placeholder={language === 'ca' ? '' : (title.ca ?? '')}
                    onChange={(event) => setTitle({ ...title, [language]: event.target.value })}
                  />
                </div>
              </Field>
              <Field orientation="responsive">
                <FieldContent>
                  <FieldLabel htmlFor="screen-intro">{t('questions.screenIntro')}</FieldLabel>
                </FieldContent>
                <div className={CONTROL_COLUMN}>
                  <Textarea
                    id="screen-intro"
                    rows={3}
                    dir={direction}
                    lang={language}
                    value={intro[language] ?? ''}
                    placeholder={language === 'ca' ? '' : (intro.ca ?? '')}
                    onChange={(event) => setIntro({ ...intro, [language]: event.target.value })}
                  />
                </div>
              </Field>
            </FieldGroup>
          </EditorSection>

          <StaffQuestionsSection
            title={t('tabQuestions')}
            testId="screen-questions"
            questions={ordered}
            language={language}
            editing={editing}
            onEdit={(id) => {
              setDraft(null);
              setEditing(id);
            }}
            onClose={close}
            onPreviewChange={setDraft}
            onReorder={reorder}
            onSaveNew={async (next) => {
              await saveCustomQuestion(supabase, next);
              await reload();
            }}
            screenId={screen.id}
          />
        </>
      }
    />
  );
}

/**
 * The saved order of a screen's staff questions, moved at once when staff drop
 * one and put back with a toast when saving fails.
 */
function useQuestionOrder(screenId: string | null, questions: readonly CustomQuestion[]) {
  const { t } = useTranslation('settings');
  const reload = useReload();
  const [order, setOrder] = useState<readonly string[]>(() => questions.map((each) => each.id));
  // A question added or archived since: the saved order again.
  const ids = questions.map((each) => each.id);
  const ordered =
    [...order].sort().join() === [...ids].sort().join()
      ? order.flatMap((id) => questions.filter((question) => question.id === id))
      : questions;
  async function reorder(next: readonly string[]) {
    if (screenId === null) return;
    const previous = order;
    setOrder(next);
    try {
      await reorderCustomQuestions(supabase, screenId, next);
      await reload();
    } catch {
      setOrder(previous);
      toast.error(t('onboardingBoard.orderFailed'));
    }
  }
  return { ordered, reorder };
}

/**
 * A screen's questions in one list (RAPP-642): an app screen's own questions
 * first, then the ones staff write (RAPP-307), and Add question under them.
 * Staff questions take every type, edit, required, drag into place, and
 * delete behind a confirm.
 */
function StaffQuestionsSection({
  title,
  testId,
  leading,
  screenId,
  questions,
  language,
  editing,
  onEdit,
  onClose,
  onPreviewChange,
  onReorder,
  onSaveNew,
}: {
  readonly title: string;
  readonly testId: string;
  /** An app screen's own question rows, listed before the staff questions. */
  readonly leading?: ReactNode;
  /** The screen that holds them; null for an app screen with none added yet. */
  readonly screenId: string | null;
  readonly questions: readonly CustomQuestion[];
  readonly language: LanguageCode;
  readonly editing: string | null;
  readonly onEdit: (id: string) => void;
  readonly onClose: () => void;
  readonly onPreviewChange: (draft: PreviewDraft) => void;
  readonly onReorder: (ids: readonly string[]) => Promise<void>;
  readonly onSaveNew: (draft: QuestionDraft) => Promise<void>;
}) {
  const { t } = useTranslation('settings');
  return (
    <EditorSection title={title} testId={testId}>
      <div className="flex flex-col gap-4">
        {questions.length === 0 && leading === undefined && editing !== NEW_QUESTION ? (
          <p className="text-start text-sm text-muted-foreground">
            {t('onboardingBoard.noQuestions')}
          </p>
        ) : null}
        {questions.length === 0 && leading === undefined ? null : (
          <CustomQuestionList
            screenId={screenId ?? ''}
            leading={leading}
            questions={screenId === null ? [] : questions}
            language={language}
            editing={editing}
            onReorder={onReorder}
            onEdit={onEdit}
            onClose={onClose}
            onPreviewChange={onPreviewChange}
          />
        )}
        {editing === NEW_QUESTION ? (
          <QuestionForm
            // An app screen's holder is made with the first question, on save.
            screenId={screenId ?? ''}
            question={null}
            canStoreFiles={uploadsAvailable(mediaWorkerUrl)}
            withPreview={false}
            withPlacements={false}
            onPreviewChange={onPreviewChange}
            onSave={onSaveNew}
            onCancel={onClose}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => onEdit(NEW_QUESTION)}
            data-testid={`${testId}-add`}
          >
            <Plus aria-hidden data-icon="inline-start" />
            {t('questions.addQuestion')}
          </Button>
        )}
      </div>
    </EditorSection>
  );
}

function CustomQuestionList({
  screenId,
  leading,
  questions,
  language,
  editing,
  onReorder,
  onEdit,
  onClose,
  onPreviewChange,
}: {
  readonly screenId: string;
  readonly leading?: ReactNode;
  readonly questions: readonly CustomQuestion[];
  readonly language: LanguageCode;
  readonly editing: string | null;
  readonly onReorder: (ids: readonly string[]) => Promise<void>;
  readonly onEdit: (id: string) => void;
  readonly onClose: () => void;
  readonly onPreviewChange: (draft: PreviewDraft) => void;
}) {
  const { t } = useTranslation('settings');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = questions.map((question) => question.id);
  const labelOf = (id: unknown) =>
    textIn(questions.find((question) => question.id === id)?.label, language);
  const positionOf = (id: unknown) => ids.indexOf(String(id)) + 1;

  function drop({ active, over }: DragEndEvent) {
    if (over === null || active.id === over.id) return;
    void onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={drop}
      accessibility={{
        screenReaderInstructions: { draggable: t('onboardingBoard.dnd.instructions') },
        announcements: {
          onDragStart: ({ active }) =>
            t('onboardingBoard.dnd.picked', {
              screen: labelOf(active.id),
              position: positionOf(active.id),
            }),
          onDragOver: ({ active, over }) =>
            over === null
              ? t('onboardingBoard.dnd.outside', { screen: labelOf(active.id) })
              : t('onboardingBoard.dnd.over', {
                  screen: labelOf(active.id),
                  position: positionOf(over.id),
                }),
          onDragEnd: ({ active, over }) =>
            over === null
              ? t('onboardingBoard.dnd.cancelled', { screen: labelOf(active.id) })
              : t('onboardingBoard.dnd.dropped', {
                  screen: labelOf(active.id),
                  position: positionOf(over.id),
                }),
          onDragCancel: ({ active }) =>
            t('onboardingBoard.dnd.cancelled', { screen: labelOf(active.id) }),
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol
          className="group/list flex flex-col divide-y rounded-lg border"
          data-testid="question-list"
        >
          {leading}
          {questions.map((question) => (
            <CustomQuestionRow
              key={question.id}
              screenId={screenId}
              question={question}
              language={language}
              isEditing={editing === question.id}
              onEdit={() => onEdit(question.id)}
              onClose={onClose}
              onPreviewChange={onPreviewChange}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function CustomQuestionRow({
  screenId,
  question,
  language,
  isEditing,
  onEdit,
  onClose,
  onPreviewChange,
}: {
  readonly screenId: string;
  readonly question: CustomQuestion;
  readonly language: LanguageCode;
  readonly isEditing: boolean;
  readonly onEdit: () => void;
  readonly onClose: () => void;
  readonly onPreviewChange: (draft: PreviewDraft) => void;
}) {
  const { t } = useTranslation('settings');
  const reload = useReload();
  const [isBusy, setIsBusy] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id });
  const label = textIn(question.label, language);
  const canRequire = canRequireCustomQuestion(question);

  async function run(action: () => Promise<void>, failed: string) {
    setIsBusy(true);
    try {
      await action();
      await reload();
    } catch {
      toast.error(failed);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative flex flex-col gap-3 bg-card p-3', isDragging && 'z-10 shadow-lg')}
      data-testid={`question-row-${question.id}`}
    >
      <div className="flex items-center gap-3">
        <Button
          ref={setActivatorNodeRef}
          type="button"
          variant="ghost"
          size="icon-sm"
          className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
          aria-label={t('onboardingBoard.dragHandle', { screen: label })}
          data-question-handle=""
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-start text-sm font-medium">{label}</p>
          <p className="truncate text-start text-xs text-muted-foreground">
            {t(`questions.types.${question.type}`)}
            {isAskedOfHer(question) ? '' : ` · ${t('onboardingBoard.notShown')}`}
          </p>
        </div>
        <RequiredToggle
          id={`required-${question.id}`}
          checked={isCustomQuestionRequired(question)}
          lockReason={canRequire ? undefined : t('questions.requiredLock.notHers')}
          disabled={isBusy}
          onChange={(next) =>
            void run(
              () => saveCustomQuestionRequired(supabase, question.id, next),
              t('questions.failed'),
            )
          }
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={isEditing ? onClose : onEdit}
          aria-expanded={isEditing}
          aria-label={t('onboardingBoard.editScreen', { screen: label })}
        >
          {t('onboardingBoard.edit')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          disabled={isBusy}
          aria-label={t('onboardingBoard.deleteQuestion', { question: label })}
          onClick={() => setIsConfirming(true)}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      {isEditing ? (
        <QuestionForm
          screenId={screenId}
          question={question}
          canStoreFiles={uploadsAvailable(mediaWorkerUrl)}
          withPreview={false}
          withPlacements={false}
          onPreviewChange={onPreviewChange}
          onSave={async (next) => {
            await saveCustomQuestion(supabase, next);
            await reload();
          }}
          onCancel={onClose}
        />
      ) : null}
      <ConfirmDialog
        isOpen={isConfirming}
        onOpenChange={setIsConfirming}
        title={t('onboardingBoard.deleteQuestionTitle')}
        description={t('onboardingBoard.deleteQuestionBody')}
        action={t('onboardingBoard.delete')}
        onConfirm={() =>
          void run(() => archiveCustomQuestion(supabase, question.id), t('questions.failed'))
        }
      />
    </li>
  );
}

/** "Required" as a switch that saves at once (RAPP-611); a locked one says why on hover. */
function RequiredToggle({
  id,
  checked,
  lockReason,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly checked: boolean;
  readonly lockReason: string | undefined;
  readonly disabled: boolean;
  readonly onChange: (next: boolean) => void;
}) {
  const { t } = useTranslation('settings');
  return (
    <div className="flex shrink-0 items-center gap-2" title={lockReason}>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled || lockReason !== undefined}
        onCheckedChange={onChange}
        aria-describedby={lockReason === undefined ? undefined : `${id}-lock`}
        data-testid={id}
      />
      <label htmlFor={id} className="text-xs font-medium whitespace-nowrap">
        {t('questions.requiredSwitch')}
      </label>
      {lockReason === undefined ? null : (
        <span id={`${id}-lock`} className="sr-only">
          {lockReason}
        </span>
      )}
    </div>
  );
}

// An app screen --------------------------------------------------------------------------------

function isQuestionScreen(screen: string): screen is WizardQuestionScreen {
  return (WIZARD_QUESTION_SCREENS as readonly string[]).includes(screen);
}

/** The detail screen that opens from a question screen, if it has one. */
function detailOf(screen: EditableWizardScreen): EditableWizardScreen | null {
  const entry = Object.entries(DETAIL_SCREEN_PARENTS).find(([, parent]) => parent === screen);
  return entry === undefined ? null : (entry[0] as EditableWizardScreen);
}

function AppScreenEditor({
  data,
  step,
  number,
  total,
}: {
  readonly data: OnboardingDesignData;
  readonly step: Exclude<BoardStep, { readonly kind: 'custom' }>;
  readonly number: number;
  readonly total: number;
}) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const catalog = data.intakeCatalog;
  const [language, setLanguage] = useState<LanguageCode>('ca');
  const [previewLanguage, setPreviewLanguage] = useState<LanguageCode>('ca');
  const screen = editableScreenOf(step);
  const detail = screen === null ? null : detailOf(screen);
  const [texts, setTexts] = useState<Partial<Record<EditableWizardScreen, ScreenTexts>>>({});
  const [shownScreen, setShownScreen] = useState<'main' | 'detail'>('main');
  const [editing, setEditing] = useState<IntakeQuestion | null>(null);
  const [editingLabel, setEditingLabel] = useState<BuilderText | undefined>(undefined);
  const currentSeason = data.seasons.find((season) => season.isCurrent);
  const reload = useReload();
  // The questions staff added to this app screen (RAPP-642), on its holder.
  const holder = step.kind === 'builtin' ? holderOf(catalog, step.key) : undefined;
  const { ordered: added, reorder: reorderAdded } = useQuestionOrder(
    holder?.id ?? null,
    holder?.questions.filter((question) => !question.isArchived) ?? [],
  );
  const [editingAdded, setEditingAdded] = useState<string | null>(null);
  const [addedDraft, setAddedDraft] = useState<PreviewDraft | null>(null);
  const closeAdded = () => {
    setEditingAdded(null);
    setAddedDraft(null);
  };
  // The holder is titled as the app screen, in every language, for the places
  // that list questions by screen (re-registration, the entity form, staff).
  const holderTitle = (screen: WizardQuestionScreen): BuilderText =>
    Object.fromEntries(
      SUPPORTED_LANGUAGES.map((code) => [
        code,
        builtinWording(screen, screenSettingsFor(catalog, screen)?.texts ?? {}, code, t).title,
      ]),
    ) as BuilderText;

  const questions = step.kind === 'builtin' ? WIZARD_SCREEN_QUESTIONS[step.key] : [];
  const hiddenQuestions = new Set(
    catalog.overrides
      .filter(
        (override) =>
          override.isHidden && canHideBuiltin(override.question, requiredBuiltinQuestions(catalog)),
      )
      .map((override) => override.question),
  );
  const phoneQuestions: PhoneQuestion[] = [
    ...questions
      .filter((question) => question === editing || !hiddenQuestions.has(question))
      .map((question) =>
        builtinPhoneQuestion(
          catalog,
          question,
          previewLanguage,
          t,
          question === editing ? editingLabel : undefined,
        ),
      ),
    // Then the added ones she is asked, the one being edited as typed.
    ...added.flatMap((question) => {
      if (question.id === editingAdded && addedDraft !== null) {
        return [
          draftPhoneQuestion(
            question.id,
            addedDraft,
            previewLanguage,
            isCustomQuestionRequired(question),
          ),
        ];
      }
      return isAskedOfHer(question) ? [customPhoneQuestion(question, previewLanguage)] : [];
    }),
    ...(editingAdded === NEW_QUESTION && addedDraft !== null
      ? [draftPhoneQuestion(NEW_QUESTION, addedDraft, previewLanguage, false)]
      : []),
  ];
  const detailContent = (): PhoneContent => {
    const wording = builtinWording(
      detail as EditableWizardScreen,
      texts[detail as EditableWizardScreen] ??
        screenSettingsFor(catalog, detail as EditableWizardScreen)?.texts ??
        {},
      previewLanguage,
      t,
    );
    return {
      title: wording.title,
      intro: wording.intro,
      help: wording.help,
      questions: [],
      lines: [],
      checkbox: null,
      signature: false,
      continueLabel: wording.continue_label,
      declineLabel: null,
    };
  };
  const content =
    shownScreen === 'detail' && detail !== null
      ? detailContent()
      : stepContent(catalog, step, previewLanguage, t, {
          ...(screen === null ? {} : { texts: texts[screen] }),
          ...(step.kind === 'builtin' ? { questions: phoneQuestions } : {}),
          documentNote:
            data.documentExplanation === null
              ? ''
              : textIn(data.documentExplanation as BuilderText, previewLanguage),
          seasonName: currentSeason?.name,
        });

  const phone = (
    <div className="flex w-full flex-col items-center gap-4">
      {detail === null || screen === null ? null : (
        <Tabs
          value={shownScreen}
          onValueChange={(next) => setShownScreen(next as 'main' | 'detail')}
        >
          <TabsList aria-label={t('onboardingBoard.phone')}>
            <TabsTrigger value="main">{t(`builtinScreens.screenName.${screen}`)}</TabsTrigger>
            <TabsTrigger value="detail">{t(`builtinScreens.screenName.${detail}`)}</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      <PhoneFrame
        content={content}
        language={previewLanguage}
        step={number}
        total={total}
        highlight={editing ?? editingAdded ?? undefined}
      />
    </div>
  );

  const builtinRows =
    questions.length === 0
      ? undefined
      : questions.map((question) => (
          <BuiltinQuestionRow
            key={question}
            catalog={catalog}
            question={question}
            language={language}
            isHidden={hiddenQuestions.has(question)}
            isEditing={editing === question}
            onEdit={() => {
              setEditingLabel(undefined);
              setEditing(question);
              setShownScreen('main');
            }}
            onClose={() => {
              setEditing(null);
              setEditingLabel(undefined);
            }}
            onLabelChange={setEditingLabel}
          />
        ));

  return (
    <div className="flex flex-col gap-8">
      <EditorColumns
        language={language}
        onLanguageChange={setLanguage}
        previewLanguage={previewLanguage}
        onPreviewLanguageChange={setPreviewLanguage}
        phone={phone}
        form={
          <>
            {screen === null ? null : (
              <WordingSection
                catalog={catalog}
                screen={screen}
                language={language}
                title={t('onboardingBoard.wording')}
                onChange={(next) => {
                  setTexts((current) => ({ ...current, [screen]: next }));
                  setShownScreen('main');
                }}
              />
            )}
            {detail === null ? null : (
              <WordingSection
                catalog={catalog}
                screen={detail}
                language={language}
                title={t(`builtinScreens.screenName.${detail}`)}
                onChange={(next) => {
                  setTexts((current) => ({ ...current, [detail]: next }));
                  setShownScreen('detail');
                }}
              />
            )}
            {step.kind === 'builtin' ? (
              <StaffQuestionsSection
                title={t('tabQuestions')}
                testId="screen-questions"
                leading={builtinRows}
                screenId={holder?.id ?? null}
                questions={added}
                language={language}
                editing={editingAdded}
                onEdit={(id) => {
                  setAddedDraft(null);
                  setEditingAdded(id);
                  setShownScreen('main');
                }}
                onClose={closeAdded}
                onPreviewChange={setAddedDraft}
                onReorder={reorderAdded}
                onSaveNew={async (next) => {
                  const screenId =
                    holder?.id ??
                    (await ensureBuiltinScreenHolder(supabase, step.key, holderTitle(step.key)));
                  await saveCustomQuestion(supabase, { ...next, screenId });
                  await reload();
                }}
              />
            ) : questions.length === 0 ? null : (
              <EditorSection title={t('tabQuestions')} testId="builtin-questions">
                <ol className="flex flex-col divide-y rounded-lg border">{builtinRows}</ol>
              </EditorSection>
            )}
            {step.key === 'documentation' ? (
              <OnboardingDocumentSection explanation={data.documentExplanation} />
            ) : null}
            {step.key === 'terms-intro' ? (
              <EditorSection
                title={t('appTerms.sectionTitle')}
                actions={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/onboarding/screens/$screenId" params={{ screenId: 'terms' }}>
                      {t('onboardingBoard.edit')}
                    </Link>
                  </Button>
                }
              >
                <p className="text-start text-sm text-muted-foreground">
                  {t('builtinScreens.termsTitleNote')}
                </p>
              </EditorSection>
            ) : null}
          </>
        }
      />
      {/* The legal texts keep their own editors, with their versions and previews. */}
      {step.key === 'terms' ? (
        <OnboardingAppTermsSection
          versions={data.termsVersions}
          canPublish={data.canPublishTerms}
        />
      ) : null}
      {step.key === 'authorization' ? (
        <OnboardingAuthorizationSection
          seasons={data.seasons}
          versions={data.versions}
          canPublish={data.canPublishTerms}
        />
      ) : null}
    </div>
  );
}

function WordingSection({
  catalog,
  screen,
  language,
  title,
  onChange,
}: {
  readonly catalog: IntakeCatalog;
  readonly screen: EditableWizardScreen;
  readonly language: LanguageCode;
  readonly title: string;
  readonly onChange: (texts: ScreenTexts) => void;
}) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const reload = useReload();
  const saved = screenSettingsFor(catalog, screen);
  const [texts, setTexts] = useState<Partial<Record<ScreenTextField, BuilderText>>>(
    saved?.texts ?? {},
  );
  const [isHidden, setIsHidden] = useState(saved?.isHidden ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const fields = screenTextFields(screen);
  const direction = getLanguageDirection(language);
  const hideable =
    isQuestionScreen(screen) &&
    canHideBuiltinScreen(screen, requiredBuiltinQuestions(catalog)) &&
    // A required added question keeps the screen shown (RAPP-642).
    !hasRequiredAddedQuestion(catalog, screen);
  const bundled = (field: ScreenTextField): string => {
    const key = BUNDLED_SCREEN_TEXT_KEYS[screen][field];
    return key === undefined ? '' : t(`onboarding:${key}`, { lng: language });
  };

  const edit = (field: ScreenTextField, value: string) => {
    const next = { ...texts, [field]: { ...texts[field], [language]: value } };
    setTexts(next);
    onChange(next);
  };

  async function save() {
    setIsSaving(true);
    try {
      await saveBuiltinScreen(supabase, { screen, texts, isHidden: hideable && isHidden });
      await reload();
      toast.success(t('builtinScreens.saved'));
    } catch {
      toast.error(t('builtinScreens.failed'));
    } finally {
      setIsSaving(false);
    }
  }

  const note =
    screen === 'terms-intro' || screen === 'terms'
      ? t('builtinScreens.termsTitleNote')
      : DETAIL_SCREEN_PARENTS[screen] === undefined
        ? null
        : t('builtinScreens.detailNote');

  return (
    <EditorSection
      title={title}
      testId={`wording-${screen}`}
      footer={
        <Button
          type="button"
          disabled={isSaving}
          onClick={() => void save()}
          data-testid={`wording-save-${screen}`}
        >
          {t('builtinScreens.save')}
        </Button>
      }
    >
      <FieldGroup>
        {note === null || screen === 'terms-intro' ? null : (
          <FieldDescription className="text-start">{note}</FieldDescription>
        )}
        {fields.map((field) => {
          const id = `wording-${screen}-${field}`;
          const shared = {
            id,
            dir: direction,
            lang: language,
            placeholder: bundled(field),
            value: texts[field]?.[language] ?? '',
          } as const;
          return (
            <Field key={field} orientation="responsive">
              <FieldContent>
                <FieldLabel htmlFor={id}>{t(`builtinScreens.field.${field}`)}</FieldLabel>
              </FieldContent>
              <div className={CONTROL_COLUMN}>
                {field === 'help' ? (
                  <Textarea
                    {...shared}
                    rows={3}
                    onChange={(event) => edit(field, event.target.value)}
                  />
                ) : (
                  <Input {...shared} onChange={(event) => edit(field, event.target.value)} />
                )}
              </div>
            </Field>
          );
        })}
        {isQuestionScreen(screen) ? (
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={`hide-${screen}`}>{t('onboardingBoard.hideScreen')}</FieldLabel>
              {hideable ? null : (
                <FieldDescription>{t('builtinScreens.hideLocked')}</FieldDescription>
              )}
              {/* Re-registration follows the same hide (RAPP-612): one rule for both. */}
              {hideable && (SEASON_WIZARD_SCREENS as readonly string[]).includes(screen) ? (
                <FieldDescription>{t('builtinScreens.hideReregistrationNote')}</FieldDescription>
              ) : null}
            </FieldContent>
            <Switch
              id={`hide-${screen}`}
              checked={hideable && isHidden}
              disabled={!hideable}
              onCheckedChange={setIsHidden}
              data-testid={`hide-${screen}`}
            />
          </Field>
        ) : null}
      </FieldGroup>
    </EditorSection>
  );
}

function BuiltinQuestionRow({
  catalog,
  question,
  language,
  isHidden,
  isEditing,
  onEdit,
  onClose,
  onLabelChange,
}: {
  readonly catalog: IntakeCatalog;
  readonly question: IntakeQuestion;
  readonly language: LanguageCode;
  readonly isHidden: boolean;
  readonly isEditing: boolean;
  readonly onEdit: () => void;
  readonly onClose: () => void;
  readonly onLabelChange: (label: BuilderText) => void;
}) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const reload = useReload();
  const [isBusy, setIsBusy] = useState(false);
  const required = requiredBuiltinQuestions(catalog);
  const override = overrideFor(catalog, question);
  const appLabel = t(QUESTION_LABEL_KEYS[question] ?? question);
  const reworded = override?.label == null ? '' : textIn(override.label, language);
  const info: BuiltinQuestionInfo = {
    question,
    label: appLabel,
    options: builtinQuestionOptions(question, t),
  };
  return (
    <li className="flex flex-col gap-3 p-3" data-testid={`builtin-row-${question}`}>
      <div className="flex items-center gap-3">
        {/* Keeps every name in the list on one line when staff rows carry a grip. */}
        <span
          aria-hidden
          className="hidden size-7 shrink-0 group-has-[[data-question-handle]]/list:block"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-start text-sm font-medium">{reworded || appLabel}</p>
          <p className="truncate text-start text-xs text-muted-foreground">
            {reworded ? t('questions.reworded', { original: appLabel }) : t('questions.asTheApp')}
          </p>
        </div>
        {isHidden ? <Badge variant="muted">{t('questions.hidden')}</Badge> : null}
        <RequiredToggle
          id={`builtin-required-${question}`}
          checked={isRequiredQuestion(question, required)}
          lockReason={
            builtinRequiredLock(question) === undefined
              ? undefined
              : t('questions.requiredLock.always')
          }
          disabled={isBusy}
          onChange={(next) => {
            setIsBusy(true);
            saveBuiltinQuestionRequired(supabase, question, next)
              .then(() => reload())
              .catch(() => toast.error(t('questions.failed')))
              .finally(() => setIsBusy(false));
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={isEditing ? onClose : onEdit}
          aria-expanded={isEditing}
          aria-label={t('questions.editBuiltin', { question: reworded || appLabel })}
        >
          {t('onboardingBoard.edit')}
        </Button>
      </div>
      {isEditing ? (
        <BuiltinForm
          info={info}
          override={override}
          required={required}
          onLabelChange={onLabelChange}
          onSave={async (next) => {
            await saveBuiltinOverride(supabase, next);
            await reload();
          }}
          onCancel={onClose}
        />
      ) : null}
    </li>
  );
}
