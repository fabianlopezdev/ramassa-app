/**
 * The registration board (RAPP-641): every onboarding screen as a card, in
 * the order her phone walks them. Staff drag a card by its grip to move the
 * screen, open it with Edit, and add a screen of their own with the first
 * card (RAPP-703): the new screen comes first. The summary and the app terms
 * end the onboarding (legal): their cards are locked, open but never move,
 * and nothing drops between them. The app terms are a form of their own
 * (RAPP-696), one linked card that opens its board.
 *
 * Below a divider, the forms chained after Onboarding (RAPP-703): one card
 * per form, the season authorization by default, dragged only among
 * themselves. × takes a form out of the chain only; it keeps applying by its
 * own rules. The last card adds a form not chained yet.
 *
 * `FormBoard` is every form's board (RAPP-696): Onboarding, the season
 * authorization and the app terms draw their cards with it.
 */

import { useReload } from '@/components/settings/onboarding-design-sections';
import {
  useSortableAccessibility,
  useSortableSensors,
} from '@/components/ui-patterns/sortable-list';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from '@tanstack/react-router';
import { EyeOff, GripVertical, Link2, Lock, Plus, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { customStepKey, type WizardStepKey } from '@ramassa/shared/intake';
import {
  AUTHORIZATION_FORM_REF,
  authorizationScreenCount,
  chainedCustomForm,
  chainedFormScreenCount,
  customFormRef,
  flowStepName,
  saveIntakeScreen,
  saveOnboardingFormChain,
  saveWizardFlowOrder,
  TERMS_SCREEN_COUNT,
  textIn,
  wizardFlow,
  type ChainedFormRef,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';
import {
  BOARD_LOCKED_STEPS,
  boardStep,
  isShownToHer,
  linkedFormOf,
  movableOrder,
  routeIdOf,
  type BoardStep,
} from './board-steps';
import { FormMiniature, PhoneMiniature } from './phone-preview';
import { stepContent, type Translate } from './screen-content';

/** Every card shares one track width, so each row's cards have one size. */
export const BOARD_GRID =
  'grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))]';

/** The name staff know a screen by, in the dashboard's language. */
export function stepName(step: BoardStep, language: LanguageCode, t: Translate): string {
  return flowStepName(step, language, t);
}

export function ScreenBoard({
  catalog,
  chain,
}: {
  readonly catalog: IntakeCatalog;
  readonly chain: readonly ChainedFormRef[];
}) {
  const { t, i18n } = useTranslation(['settings', 'onboarding', 'nav']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const reload = useReload();
  const createOnboardingScreen = useCreateOnboardingScreen();
  const initial = movableOrder(catalog);
  const hidden = wizardFlow(catalog).hiddenScreens;
  const card = (key: string): BoardCard | null => {
    const step = boardStep(catalog, key);
    if (step === null) return null;
    const content = stepContent(catalog, step, language, t);
    const linked = linkedFormOf(step.key);
    const status =
      step.kind === 'builtin' && hidden.has(step.key)
        ? t('builtinScreens.hiddenBadge')
        : step.kind === 'custom' && !isShownToHer(catalog, step.screen)
          ? t('onboardingBoard.notShown')
          : null;
    return {
      key: step.key,
      name: linked === null ? stepName(step, language, t) : t(linked.labelKey),
      // The app terms are a form of their own: one card for the whole form (RAPP-703).
      miniature:
        step.key === 'terms' ? (
          <FormMiniature
            name={t('nav:staff.appTerms')}
            kind={t('onboardingChain.termsLine')}
            screens={t('onboardingChain.screens', { count: TERMS_SCREEN_COUNT })}
            language={language}
          />
        ) : (
          <PhoneMiniature content={content} language={language} isDimmed={status !== null} />
        ),
      status,
      isLinked: linked !== null,
      link:
        linked === null
          ? { to: '/onboarding/screens/$screenId', params: { screenId: routeIdOf(step.key) } }
          : { to: linked.to },
    };
  };
  const cards = (keys: readonly string[]) =>
    keys.map(card).filter((each): each is BoardCard => each !== null);
  // Keyed by the saved order: a reload after a save or a reset starts again
  // from what the database holds.
  return (
    <div className="flex flex-col gap-6">
      <FormBoard
        key={initial.join('|')}
        label={t('onboardingBoard.listLabel')}
        movable={cards(initial)}
        trailing={cards(BOARD_LOCKED_STEPS)}
        addCard={<AddScreenCard onCreate={(name) => createOnboardingScreen(name, initial)} />}
        isAddCardFirst
        onReorder={async (next) => {
          // The same call the old order list used (`saveWizardFlowOrder`).
          await saveWizardFlowOrder(supabase, next as readonly WizardStepKey[]);
          await reload();
        }}
      />
      <ChainBoard catalog={catalog} chain={chain} />
    </div>
  );
}

/** The forms the add card offers: the authorization and the published forms she fills in. */
function chainableForms(catalog: IntakeCatalog): readonly ChainedFormRef[] {
  return [
    AUTHORIZATION_FORM_REF,
    ...(catalog.customForms ?? [])
      .filter((form) => form.filledBy === 'player' && !form.isArchived && form.publishedAt !== null)
      .map((form) => customFormRef(form.id)),
  ];
}

/**
 * The forms chained after Onboarding (RAPP-703), below the divider: the
 * same board and cards as Onboarding's screens, each card a form. The
 * chain is saved as soon as it changes, like Onboarding's own order.
 */
function ChainBoard({
  catalog,
  chain,
}: {
  readonly catalog: IntakeCatalog;
  readonly chain: readonly ChainedFormRef[];
}) {
  const { t, i18n } = useTranslation(['settings', 'nav']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const reload = useReload();
  const nameOf = (ref: ChainedFormRef): string | null => {
    if (ref === AUTHORIZATION_FORM_REF) return t('nav:staff.authorization');
    const form = chainedCustomForm(catalog, ref);
    return form === undefined ? null : textIn(form.name, language);
  };
  // A form archived since it was chained leaves the board, and the chain with the next save.
  const shown = chain.filter((ref) => nameOf(ref) !== null);
  const save = async (next: readonly ChainedFormRef[]) => {
    await saveOnboardingFormChain(supabase, next);
    await reload();
  };
  const card = (ref: ChainedFormRef): BoardCard => {
    const name = nameOf(ref) ?? '';
    const form = chainedCustomForm(catalog, ref);
    const repeats = form === undefined || form.repeatsEachSeason;
    const count =
      ref === AUTHORIZATION_FORM_REF
        ? authorizationScreenCount(catalog)
        : chainedFormScreenCount(catalog, ref);
    return {
      key: ref,
      name,
      miniature: (
        <FormMiniature
          name={name}
          kind={t(repeats ? 'onboardingChain.repeats' : 'onboardingChain.once')}
          screens={t('onboardingChain.screens', { count })}
          language={language}
        />
      ),
      status: null,
      isLinked: true,
      link:
        form === undefined
          ? { to: '/forms/authorization' }
          : { to: '/forms/custom/$formId', params: { formId: form.id } },
      remove: {
        label: t('onboardingChain.remove', { form: name }),
        run: async () => {
          try {
            await save(shown.filter((each) => each !== ref));
          } catch {
            toast.error(t('onboardingChain.saveFailed'));
          }
        },
      },
    };
  };
  const addable = chainableForms(catalog)
    .filter((ref) => !shown.includes(ref))
    .flatMap((ref) => {
      const name = nameOf(ref);
      return name === null ? [] : [{ ref, name }];
    });
  return (
    <section className="flex flex-col gap-4" aria-labelledby="onboarding-chain-divider">
      <div className="flex items-center gap-3">
        <h2
          id="onboarding-chain-divider"
          className="shrink-0 text-sm font-medium text-muted-foreground"
        >
          {t('onboardingChain.divider')}
        </h2>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      <FormBoard
        key={shown.join('|')}
        label={t('onboardingChain.listLabel')}
        numberLabelKey="onboardingChain.formStep"
        movable={shown.map(card)}
        addCard={
          <AddFormCard
            forms={addable}
            onAdd={async (ref) => {
              // First in the chain, as a new screen is first on the board.
              await save([ref, ...shown]);
            }}
          />
        }
        isAddCardFirst
        onReorder={async (next) => save(next as readonly ChainedFormRef[])}
      />
    </section>
  );
}

/** The first card of the chain, as on every board: lists the forms not chained yet and adds the one picked. */
function AddFormCard({
  forms,
  onAdd,
}: {
  readonly forms: readonly { readonly ref: ChainedFormRef; readonly name: string }[];
  readonly onAdd: (ref: ChainedFormRef) => Promise<void>;
}) {
  const { t } = useTranslation('settings');
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  async function add(ref: ChainedFormRef) {
    setIsBusy(true);
    try {
      await onAdd(ref);
      setIsOpen(false);
    } catch {
      toast.error(t('onboardingChain.saveFailed'));
    } finally {
      setIsBusy(false);
    }
  }
  return (
    <>
      <AddCard
        label={t('onboardingChain.addForm')}
        onClick={() => setIsOpen(true)}
        testId="board-add-form"
      />
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>{t('onboardingChain.addForm')}</DialogTitle>
          <DialogDescription className="sr-only">{t('onboardingChain.addForm')}</DialogDescription>
          {forms.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('onboardingChain.nothingToAdd')}</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="board-add-form-list">
              {forms.map((form) => (
                <li key={form.ref}>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    disabled={isBusy}
                    onClick={() => void add(form.ref)}
                    data-testid={`board-add-form-${form.ref}`}
                  >
                    {form.name}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Where a card opens: a screen of this form, or another form it links to. */
type BoardCardLink =
  | { readonly to: '/onboarding/screens/$screenId'; readonly params: { readonly screenId: string } }
  | {
      readonly to: '/forms/authorization/$step' | '/forms/terms/$step';
      readonly params: { readonly step: string };
    }
  | { readonly to: '/forms/authorization' | '/forms/terms' }
  | {
      // A screen of a form the team created (RAPP-700).
      readonly to: '/forms/custom/$formId/screens/$screenId';
      readonly params: { readonly formId: string; readonly screenId: string };
    }
  | {
      // A form the team created, chained after Onboarding (RAPP-703).
      readonly to: '/forms/custom/$formId';
      readonly params: { readonly formId: string };
    };

/** One card of a form's board (RAPP-696): its screen, or a linked form. */
export interface BoardCard {
  readonly key: string;
  readonly name: string;
  readonly miniature: ReactNode;
  /** Hidden or not shown to her; null when the screen shows normally. */
  readonly status: string | null;
  readonly link: BoardCardLink;
  /** A step that opens another form (RAPP-696), such as the app terms on Onboarding. */
  readonly isLinked?: boolean;
  /** One line under the picture, such as why the app terms are there (RAPP-703). */
  readonly note?: string;
  /** × on the card: takes a chained form out of the chain (RAPP-703). */
  readonly remove?: { readonly label: string; readonly run: () => Promise<void> };
}

/**
 * Every form's board (RAPP-641, shared by every form since RAPP-696): its
 * screens as cards in the order her phone walks them. The movable cards drag
 * by their grip; the locked ones before and after them open but never move,
 * and nothing drops between them. A drop shows the new order at once and
 * puts the old one back, with a toast, if the save fails. Pointer and
 * keyboard both drag, and a screen reader hears each move in the staff
 * member's language.
 */
export function FormBoard({
  label,
  leading = [],
  movable,
  trailing = [],
  addCard = null,
  isAddCardFirst = false,
  numberLabelKey = 'onboardingBoard.step',
  onReorder,
}: {
  /** The list's name for assistive technology. */
  readonly label: string;
  /** Locked cards before the movable ones. */
  readonly leading?: readonly BoardCard[];
  readonly movable: readonly BoardCard[];
  /** Locked cards after the movable ones. */
  readonly trailing?: readonly BoardCard[];
  /** A card after the last movable one, such as a form's add card. */
  readonly addCard?: ReactNode;
  /** The add card comes first, before every other card (Onboarding's, RAPP-703). */
  readonly isAddCardFirst?: boolean;
  /** How a card's number reads, "Pas 3" by default. */
  readonly numberLabelKey?: string;
  readonly onReorder: (keys: readonly string[]) => Promise<void>;
}) {
  const { t } = useTranslation('settings');
  const [order, setOrder] = useState<readonly string[]>(movable.map((card) => card.key));
  const [activeKey, setActiveKey] = useState<UniqueIdentifier | null>(null);
  const sensors = useSortableSensors();
  const byKey = new Map([...leading, ...movable, ...trailing].map((card) => [card.key, card]));
  const positionOf = (id: UniqueIdentifier): number =>
    leading.length + order.indexOf(String(id)) + 1;
  const accessibility = useSortableAccessibility(
    (id) => byKey.get(String(id))?.name ?? '',
    positionOf,
  );

  async function drop({ active, over }: DragEndEvent) {
    setActiveKey(null);
    if (over === null || active.id === over.id) return;
    const previous = order;
    const next = arrayMove(
      [...order],
      order.indexOf(String(active.id)),
      order.indexOf(String(over.id)),
    );
    setOrder(next);
    try {
      await onReorder(next);
    } catch {
      setOrder(previous);
      toast.error(t('onboardingBoard.orderFailed'));
    }
  }

  const lockedCard = (card: BoardCard, number: number) => (
    <li key={card.key} className="flex" data-testid={`board-step-${card.key}`}>
      <ScreenCard
        card={card}
        number={number}
        numberLabelKey={numberLabelKey}
        handle={null}
        isLocked
      />
    </li>
  );
  const addItem = addCard === null ? null : <li className="flex">{addCard}</li>;
  const active = activeKey === null ? null : byKey.get(String(activeKey));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={accessibility}
      onDragStart={({ active: started }) => setActiveKey(started.id)}
      onDragCancel={() => setActiveKey(null)}
      onDragEnd={(event) => void drop(event)}
    >
      <SortableContext items={[...order]} strategy={rectSortingStrategy}>
        <ol className={BOARD_GRID} aria-label={label} data-testid="screen-board">
          {isAddCardFirst ? addItem : null}
          {leading.map((card, index) => lockedCard(card, index + 1))}
          {order.map((key, index) => {
            const card = byKey.get(key);
            return card === undefined ? null : (
              <SortableCard key={key} id={key}>
                {(handle) => (
                  <ScreenCard
                    card={card}
                    number={leading.length + index + 1}
                    numberLabelKey={numberLabelKey}
                    handle={handle}
                  />
                )}
              </SortableCard>
            );
          })}
          {isAddCardFirst ? null : addItem}
          {trailing.map((card, index) =>
            lockedCard(card, leading.length + order.length + index + 1),
          )}
        </ol>
      </SortableContext>
      <DragOverlay>
        {active === undefined || active === null ? null : (
          <ScreenCard
            card={active}
            number={positionOf(active.key)}
            numberLabelKey={numberLabelKey}
            handle={null}
            isLifted
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

interface Handle {
  readonly ref: (element: HTMLElement | null) => void;
  readonly props: Record<string, unknown>;
}

function SortableCard({
  id,
  children,
}: {
  readonly id: string;
  readonly children: (handle: Handle) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      className={cn('flex', isDragging && 'opacity-40')}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid={`board-step-${id}`}
    >
      {children({ ref: setActivatorNodeRef, props: { ...attributes, ...listeners } })}
    </li>
  );
}

/** The parts every card has, so the add card keeps the same size. */
export function CardFrame({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <article
      className={cn('relative flex w-full flex-col gap-3 rounded-2xl border p-3', className)}
    >
      {children}
    </article>
  );
}

function ScreenCard({
  card,
  number,
  numberLabelKey,
  handle,
  isLocked = false,
  isLifted = false,
}: {
  readonly card: BoardCard;
  readonly number: number;
  readonly numberLabelKey: string;
  /** The grip of a movable card; null for a locked card or the lifted copy. */
  readonly handle: Handle | null;
  readonly isLocked?: boolean;
  readonly isLifted?: boolean;
}) {
  const { t } = useTranslation('settings');
  return (
    <CardFrame
      className={cn(
        'bg-card transition-shadow hover:shadow-md',
        isLocked && 'bg-muted/40',
        isLifted && 'rotate-1 shadow-xl ring-2 ring-primary',
      )}
    >
      <header className="flex h-7 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground tabular-nums">
          {t(numberLabelKey, { number })}
          {card.status === null ? null : (
            <span className="inline-flex min-w-0 items-center gap-1 font-normal">
              <EyeOff aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{card.status}</span>
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center">
          {card.remove === undefined || isLifted ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={card.remove.label}
              title={card.remove.label}
              onClick={() => void card.remove?.run()}
              data-testid={`board-remove-${card.key}`}
            >
              <X aria-hidden />
            </Button>
          )}
          {handle === null ? (
            isLifted ? null : (
              <span
                className="flex size-7 items-center justify-center text-muted-foreground"
                title={t('onboardingBoard.fixed')}
              >
                <Lock aria-hidden className="size-4" />
                <span className="sr-only">{t('onboardingBoard.fixed')}</span>
              </span>
            )
          ) : (
            <Button
              ref={handle.ref}
              type="button"
              variant="ghost"
              size="icon-sm"
              className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
              aria-label={t('onboardingBoard.dragHandle', { screen: card.name })}
              {...handle.props}
            >
              <GripVertical aria-hidden />
            </Button>
          )}
        </span>
      </header>
      <Link {...card.link} tabIndex={-1} aria-hidden className="block rounded-xl">
        {card.miniature}
      </Link>
      {card.note === undefined ? null : (
        <p className="text-start text-xs leading-5 text-muted-foreground">{card.note}</p>
      )}
      <Button asChild variant="outline" size="sm" className="w-full">
        <Link
          {...card.link}
          aria-label={t('onboardingBoard.editScreen', { screen: card.name })}
          data-testid={`board-edit-${card.key}`}
        >
          {card.isLinked === true ? (
            <>
              <Link2 aria-hidden data-icon="inline-start" />
              {t('onboardingChain.openForm')}
            </>
          ) : (
            t('onboardingBoard.edit')
          )}
        </Link>
      </Button>
    </CardFrame>
  );
}

/**
 * A Ramassà screen added to Onboarding (RAPP-703): first in her order, right
 * after the add card, and the board scrolls to it.
 */
function useCreateOnboardingScreen() {
  const reload = useReload();
  return async (name: string, order: readonly WizardStepKey[]) => {
    // The title is stored in Catalan, the language every other one falls back to.
    const id = await saveIntakeScreen(supabase, {
      id: null,
      title: { ca: name },
      intro: null,
      afterScreen: 'season',
    });
    const key = customStepKey(id);
    await saveWizardFlowOrder(supabase, [key, ...order]);
    await reload();
    document
      .querySelector(`[data-testid="board-step-${key}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
}

/** A dashed card that takes its row's height: a board's add screen or add form card. */
function AddCard({
  label,
  onClick,
  testId,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/add flex w-full rounded-2xl text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      data-testid={testId}
    >
      <CardFrame className="h-full min-h-40 border-dashed border-foreground/20 bg-muted transition-colors group-hover/add:border-primary/60 group-hover/add:bg-primary/5">
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm font-medium text-muted-foreground transition-colors group-hover/add:text-primary">
          <span className="flex size-11 items-center justify-center rounded-full border border-dashed border-current">
            <Plus aria-hidden className="size-5" />
          </span>
          {label}
        </span>
      </CardFrame>
    </button>
  );
}

/**
 * The add screen card. Every form's board adds its screens with it
 * (RAPP-700): `onCreate` makes the screen from its Catalan name.
 */
export function AddScreenCard({
  onCreate,
}: {
  readonly onCreate: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation('settings');
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <AddCard
        label={t('onboardingBoard.addScreen')}
        onClick={() => setIsOpen(true)}
        testId="board-add-screen"
      />
      <AddScreenDialog onCreate={onCreate} isOpen={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}

function AddScreenDialog({
  onCreate,
  isOpen,
  onOpenChange,
}: {
  readonly onCreate: (name: string) => Promise<void>;
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('settings');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('screen-name') ?? '').trim();
    if (name === '') {
      setError(t('onboardingBoard.nameNeeded'));
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await onCreate(name);
      onOpenChange(false);
    } catch {
      setError(t('onboardingBoard.createFailed'));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setError(null);
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogTitle>{t('onboardingBoard.newScreen')}</DialogTitle>
        <DialogDescription className="sr-only">{t('onboardingBoard.newScreen')}</DialogDescription>
        <form className="flex flex-col gap-6" onSubmit={(event) => void submit(event)} noValidate>
          <FieldGroup>
            <Field data-invalid={error !== null}>
              <FieldLabel htmlFor="new-screen-name">{t('onboardingBoard.screenName')}</FieldLabel>
              <Input
                id="new-screen-name"
                name="screen-name"
                lang="ca"
                autoComplete="off"
                autoFocus
                aria-invalid={error !== null}
                data-testid="new-screen-name"
              />
              {error === null ? null : <FieldError>{error}</FieldError>}
            </Field>
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('onboardingBoard.cancel')}
            </Button>
            <Button type="submit" disabled={isBusy} data-testid="new-screen-create">
              {t('onboardingBoard.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
