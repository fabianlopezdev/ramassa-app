/**
 * A block in a form editor's list (RAPP-690, RAPP-770): an Onboarding
 * screen's Questions, a form's screen, or the entity form's fields. One row
 * for every kind: it moves among the fields by its grip, Edit opens the
 * editor of its kind, and × removes it.
 *
 *   - A signature: the text she accepts, in the five languages (Catalan
 *     required). Its Required switch is always on. The signatures already
 *     given keep their text.
 *   - A text: an optional heading and the text she reads (Catalan required).
 *   - Points: one to eight points, each a title and a text, edited as the app
 *     terms' points are.
 *
 * A text or points block asks nothing, so its row has no Required switch.
 * "Afegeix un bloc" sits next to "Add a field" and adds a block of the kind
 * picked at the end; the entity form takes signatures only.
 */

import { useChangedForm } from '@/components/fields/changed-form';
import { ErrorLine, useAction } from '@/components/fields/field-form';
import { catalogItemIcon, type CatalogItemType } from '@/components/fields/field-type-icon';
import { LanguageFields, textFromForm } from '@/components/fields/language-fields';
import { PlacementRow } from '@/components/fields/placement-row';
import { AddPointButton, PointsEditor } from '@/components/fields/points-editor';
import { useTranslatableTexts } from '@/components/layout/translate-from-catalan';
import { ConfirmDialog } from '@/components/onboarding/confirm-dialog';
import type { SortableHandle } from '@/components/ui-patterns/sortable-list';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { changedCatalanTexts, isSameContent, withCatalanDrafts } from '@/lib/catalan-drafts';
import { useProfileLayoutActions } from '@/lib/profile-layout-actions';
import { ChevronDown, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  cleanLocalizedPoints,
  localizedPointsSchema,
  type LocalizedPoint,
} from '@ramassa/shared/intake';
import {
  formBlockName,
  type FormBlock,
  type FormBlockContent,
  type FormBlockKind,
  type FormBlockSurface,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

/** The tile of each kind in the list, as a field's type has its own. */
const KIND_TILES: Readonly<Record<FormBlockKind, CatalogItemType>> = {
  signature: 'signature',
  text: 'text_block',
  points: 'points_block',
};

export function FormBlockRow({
  block,
  handle,
  language,
  isEditing,
  onToggleEdit,
  onContentChange,
}: {
  readonly block: FormBlock;
  readonly handle: SortableHandle | null;
  /** The language the editor writes in. */
  readonly language: LanguageCode;
  readonly isEditing: boolean;
  readonly onToggleEdit: () => void;
  /** The content as typed, for a preview drawn beside it; null when the row closes. */
  readonly onContentChange?: (content: FormBlockContent | null) => void;
}) {
  const { t } = useTranslation('settings');
  const actions = useProfileLayoutActions();
  const action = useAction();
  const [isConfirming, setIsConfirming] = useState(false);
  const isSignature = block.kind === 'signature';
  const close = () => {
    onContentChange?.(null);
    onToggleEdit();
  };
  const save = (content: FormBlockContent) =>
    void action
      .run(() =>
        actions
          .saveBlock({
            id: block.id,
            surface: block.surface,
            screenKey: block.screenKey,
            ...content,
          })
          .then(() => undefined),
      )
      .then((saved) => {
        if (saved) close();
      });

  return (
    <>
      <PlacementRow
        name={formBlockName(block, language)}
        detail={t(`questions.types.${KIND_TILES[block.kind]}`)}
        type={KIND_TILES[block.kind]}
        privacy={null}
        handle={handle}
        {...(isSignature
          ? {
              required: {
                id: `block-required-${block.id}`,
                checked: true,
                lockReason: t('signatureBlock.alwaysRequired'),
                onChange: () => undefined,
              },
            }
          : {})}
        isBusy={action.isBusy}
        isEditing={isEditing}
        onToggleEdit={isEditing ? close : onToggleEdit}
        onRemove={() => setIsConfirming(true)}
        removeLabel={isSignature ? t('signatureBlock.removeNamed') : t('formBlock.removeNamed')}
        testId={`block-row-${block.id}`}
      >
        {block.kind === 'points' ? (
          <PointsBlockForm
            block={block}
            language={language}
            error={action.error}
            isBusy={action.isBusy}
            onChange={(points) => onContentChange?.({ kind: 'points', points })}
            onCancel={close}
            onSave={save}
          />
        ) : (
          <TextBlockForm
            block={block}
            error={action.error}
            isBusy={action.isBusy}
            onChange={(content) => onContentChange?.(content)}
            onCancel={close}
            onSave={save}
          />
        )}
      </PlacementRow>
      <ConfirmDialog
        isOpen={isConfirming}
        onOpenChange={setIsConfirming}
        title={isSignature ? t('signatureBlock.removeTitle') : t('formBlock.removeTitle')}
        description={isSignature ? t('signatureBlock.removeBody') : t('formBlock.removeBody')}
        action={t('placement.remove')}
        onConfirm={() => void action.run(() => actions.removeBlock(block.id))}
      />
    </>
  );
}

/** The buttons under a block's editor. */
function FormButtons({
  error,
  isBusy,
  isChanged,
  testId,
  onCancel,
}: {
  readonly error: string | null;
  readonly isBusy: boolean;
  readonly isChanged: boolean;
  readonly testId: string;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation('settings');
  return (
    <>
      <ErrorLine message={error} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('questions.cancel')}
        </Button>
        <Button type="submit" disabled={isBusy || !isChanged} data-testid={`${testId}-save`}>
          {t('placement.saveWording')}
        </Button>
      </div>
    </>
  );
}

/** A signature's text, or a text block's heading and text, in the five languages. */
function TextBlockForm({
  block,
  error,
  isBusy,
  onChange,
  onCancel,
  onSave,
}: {
  readonly block: Extract<FormBlock, { readonly kind: 'signature' | 'text' }>;
  readonly error: string | null;
  readonly isBusy: boolean;
  readonly onChange: (content: FormBlockContent) => void;
  readonly onCancel: () => void;
  readonly onSave: (content: FormBlockContent) => void;
}) {
  const { t } = useTranslation('settings');
  const changed = useChangedForm();
  const contentOf = (form: HTMLFormElement): FormBlockContent => {
    const fields = new FormData(form);
    const body = textFromForm(fields, 'block-text');
    return block.kind === 'signature'
      ? { kind: 'signature', body }
      : { kind: 'text', title: textFromForm(fields, 'block-title'), body };
  };
  return (
    <form
      ref={changed.formRef}
      className="flex max-w-xl flex-col gap-3"
      data-testid={`block-row-${block.id}-form`}
      onInput={(event) => {
        changed.track(event.currentTarget);
        onChange(contentOf(event.currentTarget));
      }}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const content = contentOf(event.currentTarget);
        if (content.kind === 'points' || (content.body.ca ?? '').trim() === '') {
          toast.error(t('questions.catalanNeeded'));
          return;
        }
        onSave(content);
      }}
    >
      {block.kind === 'text' ? (
        <LanguageFields
          name="block-title"
          legend={t('formBlock.heading')}
          value={block.title}
          isCatalanRequired={false}
        />
      ) : null}
      <LanguageFields
        name="block-text"
        legend={block.kind === 'signature' ? t('signatureBlock.text') : t('formBlock.text')}
        value={block.body}
        isCatalanRequired
        isLong
      />
      <FormButtons
        error={error}
        isBusy={isBusy}
        isChanged={changed.isChanged}
        testId={`block-row-${block.id}`}
        onCancel={onCancel}
      />
    </form>
  );
}

/** A points block's points, as the app terms' introduction edits its own. */
function PointsBlockForm({
  block,
  language,
  error,
  isBusy,
  onChange,
  onCancel,
  onSave,
}: {
  readonly block: Extract<FormBlock, { readonly kind: 'points' }>;
  readonly language: LanguageCode;
  readonly error: string | null;
  readonly isBusy: boolean;
  readonly onChange: (points: readonly LocalizedPoint[]) => void;
  readonly onCancel: () => void;
  readonly onSave: (content: FormBlockContent) => void;
}) {
  const { t } = useTranslation('settings');
  const [points, setPoints] = useState<LocalizedPoint[]>(() => [...block.points]);
  const edit = (next: LocalizedPoint[]) => {
    setPoints(next);
    onChange(next);
  };
  // The editor's translate button fills the points whose Catalan changed (RAPP-751).
  useTranslatableTexts({
    texts: () => changedCatalanTexts(points, block.points),
    apply: (target, drafts) => edit(withCatalanDrafts(points, block.points, target, drafts)),
  });
  return (
    <form
      className="flex flex-col gap-3"
      data-testid={`block-row-${block.id}-form`}
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = localizedPointsSchema.safeParse(cleanLocalizedPoints(points));
        if (!parsed.success) {
          toast.error(t('formBlock.pointsNeedCatalan'));
          return;
        }
        onSave({ kind: 'points', points: parsed.data });
      }}
    >
      <PointsEditor
        idPrefix={`block-${block.id}`}
        points={points}
        language={language}
        onChange={edit}
      />
      <div>
        <AddPointButton points={points} onChange={edit} />
      </div>
      <FormButtons
        error={error}
        isBusy={isBusy}
        isChanged={!isSameContent(points, block.points)}
        testId={`block-row-${block.id}`}
        onCancel={onCancel}
      />
    </form>
  );
}

/** What a new block of each kind holds: a first Catalan text the team words at once. */
function newBlockContent(kind: FormBlockKind, catalan: (key: string) => string): FormBlockContent {
  switch (kind) {
    case 'signature':
      return { kind, body: { ca: catalan('signatureBlock.defaultText') } };
    case 'text':
      return { kind, title: null, body: { ca: catalan('formBlock.defaultText') } };
    case 'points':
      return {
        kind,
        points: [
          {
            title: { ca: catalan('formBlock.defaultPointTitle') },
            body: { ca: catalan('formBlock.defaultPointText') },
          },
        ],
      };
  }
}

/**
 * "Afegeix un bloc": Signatura, Text or Punts, added at the end of the screen
 * and opened for its text. With one kind (the entity form), one button.
 */
export function AddBlockMenu({
  surface,
  screenKey,
  kinds = ['signature', 'text', 'points'],
  onAdded,
}: {
  readonly surface: FormBlockSurface;
  readonly screenKey: string | null;
  readonly kinds?: readonly FormBlockKind[];
  /** The new block's id, to open it for its text. */
  readonly onAdded?: (id: string) => void;
}) {
  const { t } = useTranslation('settings');
  const actions = useProfileLayoutActions();
  const [isBusy, setIsBusy] = useState(false);
  const add = (kind: FormBlockKind) => {
    setIsBusy(true);
    actions
      .saveBlock({
        id: null,
        surface,
        screenKey,
        ...newBlockContent(kind, (key) => t(key, { lng: 'ca' })),
      })
      .then((id) => onAdded?.(id))
      .catch(() => toast.error(t('questions.failed')))
      .finally(() => setIsBusy(false));
  };
  if (kinds.length === 1) {
    const [kind] = kinds as [FormBlockKind];
    const Icon = catalogItemIcon(KIND_TILES[kind]);
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isBusy}
        onClick={() => add(kind)}
        data-testid={`${surface}-add-${kind}`}
      >
        <Icon aria-hidden data-icon="inline-start" />
        {kind === 'signature' ? t('signatureBlock.add') : t('formBlock.add')}
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isBusy}
          data-testid={`${surface}-add-block`}
        >
          <Plus aria-hidden data-icon="inline-start" />
          {t('formBlock.add')}
          <ChevronDown aria-hidden data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {kinds.map((kind) => {
          const Icon = catalogItemIcon(KIND_TILES[kind]);
          return (
            <DropdownMenuItem
              key={kind}
              onSelect={() => add(kind)}
              data-testid={`${surface}-add-${kind}`}
            >
              <Icon aria-hidden />
              {t(`questions.types.${KIND_TILES[kind]}`)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
