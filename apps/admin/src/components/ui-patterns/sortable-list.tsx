/**
 * Drag to reorder (RAPP-641, RAPP-642, RAPP-650): the pieces every sortable
 * list and board of the Control Center shares.
 *
 *   - `useSortableSensors`: pointer (after a 6px move, so a click stays a
 *     click) and keyboard (space or enter, arrows, space or enter again).
 *   - `useSortableAccessibility`: what a screen reader hears at each step, in
 *     the staff member's language, by the item's name and position.
 *   - `SortableItem` and `DragHandle`: one row that moves by its grip.
 *   - `SortableList`: a vertical list that saves its new order on drop.
 *
 * A board that needs more (a grid, an overlay, items moving between lists)
 * builds its own `DndContext` from the same pieces.
 */

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function useSortableSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** The announcements of a drag, by the item's name and its position (from 1). */
export function useSortableAccessibility(
  nameOf: (id: UniqueIdentifier) => string,
  positionOf: (id: UniqueIdentifier) => number,
): {
  readonly announcements: Announcements;
  readonly screenReaderInstructions: ScreenReaderInstructions;
} {
  const { t } = useTranslation('settings');
  return {
    screenReaderInstructions: { draggable: t('sortable.instructions') },
    announcements: {
      onDragStart: ({ active }) =>
        t('sortable.picked', { item: nameOf(active.id), position: positionOf(active.id) }),
      onDragOver: ({ active, over }) =>
        over === null
          ? t('sortable.outside', { item: nameOf(active.id) })
          : t('sortable.over', { item: nameOf(active.id), position: positionOf(over.id) }),
      onDragEnd: ({ active, over }) =>
        over === null
          ? t('sortable.cancelled', { item: nameOf(active.id) })
          : t('sortable.dropped', { item: nameOf(active.id), position: positionOf(over.id) }),
      onDragCancel: ({ active }) => t('sortable.cancelled', { item: nameOf(active.id) }),
    },
  };
}

/** The grip's element and its drag listeners, handed to the row. */
export interface SortableHandle {
  readonly ref: (element: HTMLElement | null) => void;
  readonly props: Record<string, unknown>;
}

/** One sortable row. `data` tells a board what kind of item moves. */
export function SortableItem({
  id,
  data,
  className,
  draggingClassName = 'z-10 shadow-lg',
  disabled = false,
  testId,
  children,
}: {
  readonly id: string;
  readonly data?: Record<string, unknown>;
  readonly className?: string;
  readonly draggingClassName?: string;
  readonly disabled?: boolean;
  readonly testId?: string;
  readonly children: (handle: SortableHandle) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', className, isDragging && draggingClassName)}
      data-testid={testId}
    >
      {children({ ref: setActivatorNodeRef, props: { ...attributes, ...listeners } })}
    </li>
  );
}

/** The grip a row moves by; the label names what moves. */
export function DragHandle({
  handle,
  label,
  className,
}: {
  readonly handle: SortableHandle;
  readonly label: string;
  readonly className?: string;
}) {
  return (
    <Button
      ref={handle.ref}
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn(
        'shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing',
        className,
      )}
      aria-label={label}
      data-sortable-handle=""
      {...handle.props}
    >
      <GripVertical aria-hidden />
    </Button>
  );
}

/**
 * A vertical list that moves its rows by their grips and hands the new order
 * to `onReorder`, which saves it (and puts the old order back when it fails).
 */
export function SortableList<Item>({
  items,
  idOf,
  nameOf,
  onReorder,
  leading,
  className,
  itemClassName,
  itemTestId,
  testId,
  children,
}: {
  readonly items: readonly Item[];
  readonly idOf: (item: Item) => string;
  /** The name a screen reader hears for an item. */
  readonly nameOf: (item: Item) => string;
  readonly onReorder: (ids: readonly string[]) => void;
  /** Rows before the sortable ones that never move. */
  readonly leading?: ReactNode;
  readonly className?: string;
  readonly itemClassName?: string;
  readonly itemTestId?: (item: Item) => string;
  readonly testId?: string;
  readonly children: (item: Item, handle: SortableHandle) => ReactNode;
}) {
  const sensors = useSortableSensors();
  const ids = items.map(idOf);
  const accessibility = useSortableAccessibility(
    (id) => {
      const item = items.find((each) => idOf(each) === String(id));
      return item === undefined ? '' : nameOf(item);
    },
    (id) => ids.indexOf(String(id)) + 1,
  );

  function drop({ active, over }: DragEndEvent) {
    if (over === null || active.id === over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={drop}
      accessibility={accessibility}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className={className} data-testid={testId}>
          {leading}
          {items.map((item) => (
            <SortableItem
              key={idOf(item)}
              id={idOf(item)}
              className={cn('bg-card', itemClassName)}
              testId={itemTestId?.(item)}
            >
              {(handle) => children(item, handle)}
            </SortableItem>
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
