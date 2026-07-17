/**
 * Automatic PII redaction (RAPP-12). This app serves refugee women; a leaked
 * name, phone, or document number is a safety problem, not a privacy footnote.
 * The hard rule: names, phones, addresses, emails, and document numbers NEVER
 * enter logs or Sentry — only opaque IDs do. This module is the enforcement
 * net every log entry and error report passes through; it is tested against
 * seeded fixtures, never assumed.
 *
 * Two layers:
 *   1. Key-based: values under known PII keys are replaced wholesale.
 *   2. Pattern-based: emails, phone numbers, and DNI/NIE formats are scrubbed
 *      out of free-text string values (notes, error messages) under any key.
 */

export const REDACTED = '[REDACTED]';

/**
 * Keys whose values are always redacted, matched on the lowercased key with
 * `_`/`-` stripped, as an EXACT match. Exact (not substring) so technical
 * keys like `fileName` survive while `name` itself never does.
 */
const piiKeys = new Set([
  'name',
  'fullname',
  'firstname',
  'lastname',
  'surname',
  'middlename',
  'phone',
  'phonenumber',
  'telephone',
  'mobile',
  'email',
  'emailaddress',
  'address',
  'street',
  'streetaddress',
  'postaladdress',
  'document',
  'documentnumber',
  'passport',
  'passportnumber',
  'dni',
  'nie',
  'birthdate',
  'dateofbirth',
  'birthday',
  'nationality',
]);

function isPiiKey(key: string): boolean {
  return piiKeys.has(key.toLowerCase().replaceAll(/[_-]/g, ''));
}

const spanishDniPattern = /\b\d{8}[a-z]\b/gi;
const spanishNiePattern = /\b[xyz]\d{7}[a-z]\b/gi;
const emailPattern = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
/**
 * Digit runs (with optional +, spaces, hyphens) that contain at least nine
 * digits — Spanish subscriber numbers and international formats — while
 * ISO dates (eight digits) survive.
 */
const phoneCandidatePattern = /\+?\d[\d\s-]*\d/g;
const minimumPhoneDigits = 9;

function redactStringPatterns(value: string): string {
  return value
    .replaceAll(spanishNiePattern, REDACTED)
    .replaceAll(spanishDniPattern, REDACTED)
    .replaceAll(emailPattern, REDACTED)
    .replaceAll(phoneCandidatePattern, (candidate) =>
      candidate.replaceAll(/\D/g, '').length >= minimumPhoneDigits ? REDACTED : candidate,
    );
}

function redactValue(value: unknown, seenObjects: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return redactStringPatterns(value);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seenObjects.has(value)) {
    return '[CIRCULAR]';
  }
  seenObjects.add(value);

  if (value instanceof Error) {
    // Keep what debugging needs; scrub what a message might carry.
    return {
      name: value.name,
      message: redactStringPatterns(value.message),
      ...('code' in value ? { code: value.code } : {}),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seenObjects));
  }

  const redactedObject: Record<string, unknown> = {};
  for (const [key, propertyValue] of Object.entries(value)) {
    redactedObject[key] = isPiiKey(key) ? REDACTED : redactValue(propertyValue, seenObjects);
  }
  return redactedObject;
}

/** Returns a deep-redacted copy; the input is never mutated. */
export function redactPii(value: unknown): unknown {
  return redactValue(value, new WeakSet());
}
