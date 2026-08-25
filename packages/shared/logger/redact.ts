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
  // Mentoring (RAPP-57). The controlled topic is reportable inside the
  // authorized product, but it can reveal gender violence, asylum, or another
  // sensitive support need. Neither the topic nor either note field may enter
  // logs or Sentry, even when a whole database row is passed as context.
  'topic',
  'mentoringtopic',
  'topicdetail',
  'staffnotes',
  // Credentials (RAPP-25). The account-creation and password-reset RPCs return
  // a plaintext password ONCE, to be read aloud and written on paper. It is
  // stored nowhere, and a failure carrying it into `safeAsync`'s context would
  // put it in a log line and in Sentry, which is the one place it must never
  // reach: an issue-tracker search would then hand over live credentials for a
  // refugee woman's account.
  'password',
  'newpassword',
  'currentpassword',
  'credential',
  'credentials',
  'secret',
  'token',
  'accesstoken',
  'accesscode',
  'refreshtoken',
  'apikey',
]);

function isPiiKey(key: string): boolean {
  return piiKeys.has(key.toLowerCase().replaceAll(/[_-]/g, ''));
}

const spanishDniPattern = /\b\d{8}[a-z]\b/gi;
const spanishNiePattern = /\b[xyz]\d{7}[a-z]\b/gi;
const emailPattern = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
/**
 * A UUID token, matched before the broader phone candidate alternative.
 *
 * Opaque IDs are the one thing this module is supposed to let through: they are
 * what makes an incident traceable back to a record, and a log line that has
 * scrubbed its own identifiers cannot be investigated at all. The phone pattern
 * does not know that, and a hyphenated run of digits is exactly what a UUID
 * looks like to it — the seeded identifiers, being mostly zeroes, were coming
 * out as "5eed[REDACTED]" (found by a RAPP-25 test asserting the promise in
 * this file's own docstring).
 *
 * The anchored form classifies each matched candidate. The unanchored form in
 * `uuidOrPhoneCandidatePattern` lets the same UUID survive inside free text.
 */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * UUIDs, or digit runs (with optional +, spaces, hyphens) that may be phone
 * numbers. Candidates with at least nine digits are redacted, while ISO dates
 * (eight digits) survive.
 */
const uuidOrPhoneCandidatePattern =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\+?\d[\d\s-]*\d/gi;
const minimumPhoneDigits = 9;

function redactStringPatterns(value: string): string {
  return value
    .replaceAll(spanishNiePattern, REDACTED)
    .replaceAll(spanishDniPattern, REDACTED)
    .replaceAll(emailPattern, REDACTED)
    .replaceAll(uuidOrPhoneCandidatePattern, (candidate) => {
      if (uuidPattern.test(candidate)) {
        return candidate;
      }
      return candidate.replaceAll(/\D/g, '').length >= minimumPhoneDigits ? REDACTED : candidate;
    });
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
