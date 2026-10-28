import {
  DEFAULT_FOLLOW_UP_ASKING,
  documentDetailScreen,
  type FollowUpAsking,
} from '@ramassa/shared/intake';
import {
  documentationFields,
  refineDocumentDetails,
  type DocumentationStep,
  type DocumentType,
} from '@ramassa/shared/schemas';

export type DocumentChoice = DocumentType | 'skip';
/**
 * Her answer opens a document follow-up: one screen per answer (RAPP-715),
 * by the rule the board's branch cards read (RAPP-713).
 */
export function hasDocumentDetails(type: unknown): type is Exclude<DocumentType, 'none'> {
  return documentDetailScreen(type) !== null;
}

/** Changing type clears the previous document's identity and number. */
export function documentationForChoice(
  choice: DocumentChoice,
  saved: Partial<DocumentationStep>,
): Partial<DocumentationStep> {
  if (choice === 'skip') return {};
  if (choice === 'none') return { documentType: 'none' };
  return saved.documentType === choice
    ? { ...saved, documentType: choice }
    : { documentType: choice };
}

/**
 * The document follow-up's Continue check (RAPP-720): what the follow-up of
 * her document asks and requires, as staff placed its fields.
 */
export function documentDetailsSchemaFor(asking: FollowUpAsking = DEFAULT_FOLLOW_UP_ASKING) {
  return documentationFields.superRefine(refineDocumentDetails(asking, false));
}
