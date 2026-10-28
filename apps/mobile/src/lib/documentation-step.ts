import { documentDetailScreen } from '@ramassa/shared/intake';
import {
  documentationFields,
  refineDocumentNumber,
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

export const documentDetailsSchema = documentationFields.superRefine((value, context) => {
  refineDocumentNumber(value, context);
  if (value.documentType === 'other') {
    if (!value.documentName) {
      context.addIssue({ code: 'custom', path: ['documentName'], message: 'required' });
    }
    if (!value.documentNumber) {
      context.addIssue({ code: 'custom', path: ['documentNumber'], message: 'required' });
    }
  }
});
