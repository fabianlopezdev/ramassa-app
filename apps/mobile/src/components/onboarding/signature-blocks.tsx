/**
 * The signature blocks of one screen of her Onboarding (RAPP-690), for the
 * screen that draws them among its fields: an app screen (`placed-fields.tsx`)
 * or a Ramassà screen (`custom/[screenId].tsx`).
 *
 * Each block shows in its place among the fields placed on the screen, by the
 * order they share (a field first on a tie). Every block is required: Continue
 * refuses while one is unsigned. The strokes stay in her draft (`signatures`,
 * by block id) on Continue and on Back, so saved progress keeps them until the
 * terms step sends them with her registration.
 */

import { SignatureBlockField } from '@/components/onboarding/signature-block-field';
import { onboardingDraftStore } from '@/lib/onboarding';
import { useWizardIntake } from '@/lib/onboarding-intake-context';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SignatureStrokes } from '@ramassa/shared/equipment';
import {
  formBlocksOn,
  placementOn,
  unsignedFormBlocks,
  type CustomQuestion,
  type FormBlock,
} from '@ramassa/shared/intake-builder';

type Drafts = Readonly<Record<string, SignatureStrokes | null>>;

export interface SignatureBlocks {
  readonly blocks: readonly FormBlock[];
  readonly hasErrors: boolean;
  /** The screen's visible fields and its blocks, in their shared order. */
  readonly interleave: (
    questions: readonly CustomQuestion[],
    renderQuestion: (question: CustomQuestion) => ReactNode,
  ) => ReactNode[];
  /** Marks the unsigned blocks; true when every block is signed. */
  readonly check: () => boolean;
  /** Her draft's signatures with this screen's strokes in them. */
  readonly drafted: (saved: Drafts | undefined) => Drafts;
}

export function useSignatureBlocks(
  screenKey: string | undefined,
  onDrawingChange: (isDrawing: boolean) => void,
): SignatureBlocks {
  const { t } = useTranslation('onboarding');
  const { catalog } = useWizardIntake();
  const blocks =
    screenKey === undefined ? [] : formBlocksOn(catalog.blocks, 'onboarding', screenKey);
  const [strokes, setStrokes] = useState<Drafts>(() => {
    const saved = onboardingDraftStore.loadDraft()?.signatures;
    return Object.fromEntries(blocks.map((block) => [block.id, saved?.[block.id] ?? null]));
  });
  const [unsigned, setUnsigned] = useState<ReadonlySet<string>>(new Set());

  const field = (block: FormBlock) => (
    <SignatureBlockField
      key={block.id}
      block={block}
      strokes={strokes[block.id] ?? null}
      onDrawingChange={onDrawingChange}
      errorMessage={unsigned.has(block.id) ? t('customErrorSignature') : undefined}
      onChange={(next) => {
        setStrokes((current) => ({ ...current, [block.id]: next }));
        if (next !== null && unsigned.has(block.id)) {
          setUnsigned((current) => new Set([...current].filter((id) => id !== block.id)));
        }
      }}
    />
  );

  return {
    blocks,
    hasErrors: unsigned.size > 0,
    interleave(questions, renderQuestion) {
      const order = (question: CustomQuestion) =>
        catalog.layout === undefined
          ? Number.POSITIVE_INFINITY
          : (placementOn(catalog.layout, question.id, 'onboarding')?.sortOrder ??
            Number.POSITIVE_INFINITY);
      const nodes: ReactNode[] = [];
      let next = 0;
      for (const question of questions) {
        while (next < blocks.length && (blocks[next]?.sortOrder ?? 0) < order(question)) {
          nodes.push(field(blocks[next] as FormBlock));
          next += 1;
        }
        nodes.push(renderQuestion(question));
      }
      for (const block of blocks.slice(next)) nodes.push(field(block));
      return nodes;
    },
    check() {
      const missing = unsignedFormBlocks(blocks, strokes);
      setUnsigned(new Set(missing));
      return missing.length === 0;
    },
    drafted: (saved) => ({ ...saved, ...strokes }),
  };
}
