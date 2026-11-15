/**
 * Número de document keeps the check of her document type wherever staff
 * place it (RAPP-782). On the document follow-ups the app's own control checks
 * a NIE's form; placed on any other screen, or asked by the generic renderer
 * because Tipus de document moved, the same check runs on the field's answer.
 * Her document type is her answer to Tipus de document by field (an option
 * id), or, while Tipus de document keeps its own control, the type her
 * document screen saved. A passport and another document have no form to
 * check. Pure: her phone and the tests read it alike.
 */
import { NIE_PATTERN } from '../schemas/onboarding';
import { systemFieldsOf, type CustomAnswers, type IntakeCatalog } from './builder';

/** Where her document number is and which type of document it belongs to. */
export interface DocumentNumberRule {
  readonly fieldId: string;
  /** The option key of her document type (`nie`, `passport`, `other`, `none`), if she gave one. */
  readonly typeKey: string | undefined;
}

/**
 * The rule for her answers: her document type from `answers` when Tipus de
 * document is answered by field, else `formType`. Undefined without a
 * document number field.
 */
export function documentNumberRule(
  catalog: IntakeCatalog,
  answers: CustomAnswers,
  formType?: string,
): DocumentNumberRule | undefined {
  const fields = systemFieldsOf(catalog);
  const number = fields.get('document_number');
  if (number === undefined) return undefined;
  const type = fields.get('document_type');
  const answered = type === undefined ? undefined : answers[type.id];
  const typeKey =
    typeof answered === 'string'
      ? (type?.options.find((option) => option.id === answered)?.key ?? undefined)
      : formType;
  return { fieldId: number.id, typeKey };
}

/** Her document number as the check reads it: trimmed, in capitals. */
export function tidyDocumentNumber(value: string): string {
  return value.trim().toUpperCase();
}

/** Why her document number does not fit her document type, or null when it fits or is empty. */
export function documentNumberIssue(
  rule: DocumentNumberRule | undefined,
  answers: CustomAnswers,
): 'nie' | null {
  if (rule?.typeKey !== 'nie') return null;
  const value = answers[rule.fieldId];
  if (typeof value !== 'string' || value.trim() === '') return null;
  return NIE_PATTERN.test(tidyDocumentNumber(value)) ? null : 'nie';
}
