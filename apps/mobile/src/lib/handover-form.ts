/**
 * The pure rules of the handover screen (RAPP-249), apart from React so they
 * are tested on their own.
 */
import {
  signatureStrokesSchema,
  STATEMENT_LANGUAGES,
  type HandoverSignature,
  type SignatureStrokes,
  type StatementLanguage,
  type UnsignedState,
} from '@ramassa/shared/equipment';
import {
  fieldOfFeature,
  optionKeyOf,
  type FieldFeatureKey,
  type SystemFieldIndex,
} from '@ramassa/shared/intake-builder';

const SHOE_SIZED = new Set(['boots']);

/**
 * Her size from her profile, when the item comes in it: shoe size for boots,
 * clothing size for the rest. Staff still see and can change it.
 */
export function suggestedSize(
  itemKey: string,
  sizes: readonly string[],
  her: { readonly clothingSize: string | null; readonly shoeSize: string | null },
): string | null {
  const size = SHOE_SIZED.has(itemKey) ? her.shoeSize : her.clothingSize;
  return size !== null && sizes.includes(size) ? size : null;
}

/**
 * Her sizes from her answers, through the features that read them (D7,
 * RAPP-663): each one the key of the option she chose. A size field staff
 * changed to a type the handover cannot read suggests nothing.
 */
export function herSizes(
  fields: SystemFieldIndex,
  answers: Readonly<Record<string, unknown>>,
): { readonly clothingSize: string | null; readonly shoeSize: string | null } {
  const sizeOf = (feature: FieldFeatureKey): string | null => {
    const field = fieldOfFeature(feature, fields);
    return field === undefined ? null : (optionKeyOf(field, answers[field.id]) ?? null);
  };
  return {
    clothingSize: sizeOf('equipment.clothing_size'),
    shoeSize: sizeOf('equipment.shoe_size'),
  };
}

/** She reads the statement in her own language; Catalan when it is unknown. */
export function statementLanguageFor(preferred: string | null): StatementLanguage {
  return (STATEMENT_LANGUAGES as readonly string[]).includes(preferred ?? '')
    ? (preferred as StatementLanguage)
    : 'ca';
}

/**
 * What the screen may save: her strokes, or a reason she did not sign. Null
 * while neither is complete, so the save button stays off.
 */
export function handoverSignature(input: {
  readonly strokes: SignatureStrokes | null;
  readonly unsigned: UnsignedState | null;
  readonly reason: string;
}): HandoverSignature | null {
  if (input.unsigned !== null) {
    const reason = input.reason.trim();
    return reason.length === 0 ? null : { state: input.unsigned, reason };
  }
  return input.strokes !== null && signatureStrokesSchema.safeParse(input.strokes).success
    ? { state: 'signed', strokes: input.strokes }
    : null;
}
