/**
 * The registration board (RAPP-641): every onboarding screen as a card, in
 * the order her phone walks them. Staff drag a card by its grip to move the
 * screen, open it with Edit, and add a screen of their own with the last
 * movable card. The summary, the terms and the season authorization end the
 * onboarding (legal): their cards are locked, open but never move, and
 * nothing drops between them.
 *
 * A drop saves the order at once through the same call the old order list
 * used (`saveWizardFlowOrder`). The board shows the new order before the
 * database answers and puts the old one back, with a toast, if it refuses.
 * Pointer and keyboard both drag, and a screen reader hears each move in the
 * staff member's language.
 */

import { useReload } from '@/components/settings/onboarding-design-sections';
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
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link, useNavigate } from '@tanstack/react-router';
import { EyeOff, GripVertical, Lock, Plus } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { customStepKey, type WizardStepKey } from '@ramassa/shared/intake';
import {
  saveIntakeScreen,
  saveWizardFlowOrder,
  textIn,
  wizardFlow,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';
import {
  boardStep,
  isShownToHer,
  LOCKED_STEPS,
  movableOrder,
  routeIdOf,
  type BoardStep,
} from './board-steps';
import { PhoneMiniature } from './phone-preview';
import { stepContent, type Translate } from './screen-content';

/** Every card shares one track width, so each row's cards have one size. */
const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))]';

/** The name staff know a screen by, in the dashboard's language. */
export function stepName(step: BoardStep, language: LanguageCode, t: Translate): string {
  if (step.kind === 'custom') return textIn(step.screen.title, language);
  if (step.key === 'authorization') return t('settings:onboardingBoard.authorization');
  return t(`settings:builtinScreens.screenName.${step.key}`);
}

export function ScreenBoard({ catalog }: { readonly catalog: IntakeCatalog }) {
  const initial = movableOrder(catalog);
  // Keyed by the saved order: a reload after a save or a reset starts again
  // from what the database holds.
  return <BoardGrid key={initial.join('|')} catalog={catalog} initial={initial} />;
}

function BoardGrid({
  catalog,
  initial,
}: {
  readonly catalog: IntakeCatalog;
  readonly initial: readonly WizardStepKey[];
}) {
  const { t, i18n } = useTranslation(['settings', 'onboarding']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const reload = useReload();
  const [order, setOrder] = useState<readonly WizardStepKey[]>(initial);
  const [activeKey, setActiveKey] = useState<UniqueIdentifier | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const steps = new Map(
    [...order, ...LOCKED_STEPS].flatMap((key) => {
      const step = boardStep(catalog, key);
      return step === null ? [] : [[key as string, step] as const];
    }),
  );
  const nameOf = (id: UniqueIdentifier): string => {
    const step = steps.get(String(id));
    return step === undefined ? '' : stepName(step, language, t);
  };
  const positionOf = (id: UniqueIdentifier): number => order.indexOf(id as WizardStepKey) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t('onboardingBoard.dnd.picked', {
        screen: nameOf(active.id),
        position: positionOf(active.id),
      }),
    onDragOver: ({ active, over }) =>
      over === null
        ? t('onboardingBoard.dnd.outside', { screen: nameOf(active.id) })
        : t('onboardingBoard.dnd.over', {
            screen: nameOf(active.id),
            position: positionOf(over.id),
          }),
    onDragEnd: ({ active, over }) =>
      over === null
        ? t('onboardingBoard.dnd.cancelled', { screen: nameOf(active.id) })
        : t('onboardingBoard.dnd.dropped', {
            screen: nameOf(active.id),
            position: positionOf(over.id),
          }),
    onDragCancel: ({ active }) => t('onboardingBoard.dnd.cancelled', { screen: nameOf(active.id) }),
  };

  async function drop({ active, over }: DragEndEvent) {
    setActiveKey(null);
    if (over === null || active.id === over.id) return;
    const previous = order;
    const next = arrayMove(
      [...order],
      order.indexOf(active.id as WizardStepKey),
      order.indexOf(over.id as WizardStepKey),
    );
    setOrder(next);
    try {
      await saveWizardFlowOrder(supabase, next);
      await reload();
    } catch {
      setOrder(previous);
      toast.error(t('onboardingBoard.orderFailed'));
    }
  }

  const hidden = wizardFlow(catalog).hiddenScreens;
  const card = (key: string, number: number) => {
    const step = steps.get(key);
    if (step === undefined) return null;
    const content = stepContent(catalog, step, language, t);
    const status =
      step.kind === 'builtin' && hidden.has(step.key)
        ? t('builtinScreens.hiddenBadge')
        : step.kind === 'custom' && !isShownToHer(step.screen)
          ? t('onboardingBoard.notShown')
          : null;
    return {
      step,
      number,
      name: stepName(step, language, t),
      miniature: (
        <PhoneMiniature content={content} language={language} isDimmed={status !== null} />
      ),
      status,
    };
  };
  const active = activeKey === null ? null : card(String(activeKey), positionOf(activeKey));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t('onboardingBoard.dnd.instructions') },
      }}
      onDragStart={({ active: started }) => setActiveKey(started.id)}
      onDragCancel={() => setActiveKey(null)}
      onDragEnd={(event) => void drop(event)}
    >
      <SortableContext items={[...order]} strategy={rectSortingStrategy}>
        <ol className={GRID} aria-label={t('onboardingBoard.listLabel')} data-testid="screen-board">
          {order.map((key, index) => {
            const view = card(key, index + 1);
            return view === null ? null : (
              <SortableCard key={key} id={key}>
                {(handle) => <ScreenCard {...view} handle={handle} />}
              </SortableCard>
            );
          })}
          <li className="flex">
            <AddScreenCard order={order} />
          </li>
          {LOCKED_STEPS.map((key, index) => {
            const view = card(key, order.length + index + 1);
            return view === null ? null : (
              <li key={key} className="flex" data-testid={`board-step-${key}`}>
                <ScreenCard {...view} handle={null} />
              </li>
            );
          })}
        </ol>
      </SortableContext>
      <DragOverlay>
        {active === null ? null : <ScreenCard {...active} handle={null} isLifted />}
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
function CardFrame({
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
  step,
  number,
  name,
  miniature,
  status,
  handle,
  isLifted = false,
}: {
  readonly step: BoardStep;
  readonly number: number;
  readonly name: string;
  readonly miniature: ReactNode;
  /** Hidden or not shown to her; null when the screen shows normally. */
  readonly status: string | null;
  /** The grip of a movable card; null for a locked card or the lifted copy. */
  readonly handle: Handle | null;
  readonly isLifted?: boolean;
}) {
  const { t } = useTranslation('settings');
  const isLocked = step.kind === 'locked';
  const to = '/onboarding/screens/$screenId' as const;
  const params = { screenId: routeIdOf(step.key) };
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
          {t('onboardingBoard.step', { number })}
          {status === null ? null : (
            <span className="inline-flex min-w-0 items-center gap-1 font-normal">
              <EyeOff aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{status}</span>
            </span>
          )}
        </span>
        {isLocked ? (
          <span
            className="flex size-7 items-center justify-center text-muted-foreground"
            title={t('onboardingBoard.fixed')}
          >
            <Lock aria-hidden className="size-4" />
            <span className="sr-only">{t('onboardingBoard.fixed')}</span>
          </span>
        ) : (
          <Button
            ref={handle?.ref}
            type="button"
            variant="ghost"
            size="icon-sm"
            className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
            aria-label={t('onboardingBoard.dragHandle', { screen: name })}
            {...(handle?.props ?? {})}
          >
            <GripVertical aria-hidden />
          </Button>
        )}
      </header>
      <Link to={to} params={params} tabIndex={-1} aria-hidden className="block rounded-xl">
        {miniature}
      </Link>
      <Button asChild variant="outline" size="sm" className="w-full">
        <Link
          to={to}
          params={params}
          aria-label={t('onboardingBoard.editScreen', { screen: name })}
          data-testid={`board-edit-${step.key}`}
        >
          {t('onboardingBoard.edit')}
        </Link>
      </Button>
    </CardFrame>
  );
}

/** The add card: a dashed card of the same size, after the last movable screen. */
function AddScreenCard({ order }: { readonly order: readonly WizardStepKey[] }) {
  const { t } = useTranslation('settings');
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="group/add flex w-full rounded-2xl text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        data-testid="board-add-screen"
      >
        <CardFrame className="border-dashed border-foreground/20 bg-transparent transition-colors group-hover/add:border-primary/60 group-hover/add:bg-primary/5">
          {/* The same rows as a screen card, unseen, so both have one size. */}
          <div aria-hidden className="invisible flex flex-col gap-3">
            <div className="h-7" />
            <div className="aspect-[3/5] w-full" />
            <div className="h-8" />
          </div>
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm font-medium text-muted-foreground transition-colors group-hover/add:text-primary">
            <span className="flex size-11 items-center justify-center rounded-full border border-dashed border-current">
              <Plus aria-hidden className="size-5" />
            </span>
            {t('onboardingBoard.addScreen')}
          </span>
        </CardFrame>
      </button>
      <AddScreenDialog order={order} isOpen={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}

function AddScreenDialog({
  order,
  isOpen,
  onOpenChange,
}: {
  readonly order: readonly WizardStepKey[];
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
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
      // The title is stored in Catalan, the language every other one falls back to.
      const id = await saveIntakeScreen(supabase, {
        id: null,
        title: { ca: name },
        intro: null,
        afterScreen: 'season',
      });
      // Placed after the last movable screen, before the ones that end the onboarding.
      await saveWizardFlowOrder(supabase, [...order, customStepKey(id)]);
      onOpenChange(false);
      await navigate({ to: '/onboarding/screens/$screenId', params: { screenId: id } });
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
