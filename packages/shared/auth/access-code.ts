export const ACCESS_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const ACCESS_CODE_GROUP_LENGTH = 4;
export const ACCESS_CODE_GROUP_COUNT = 3;
export const ACCESS_CODE_RAW_LENGTH = ACCESS_CODE_GROUP_LENGTH * ACCESS_CODE_GROUP_COUNT;
export const ACCESS_CODE_CANONICAL_LENGTH = ACCESS_CODE_RAW_LENGTH + ACCESS_CODE_GROUP_COUNT - 1;
export const ACCESS_CODE_INTERNAL_DOMAIN = 'ramassa.invalid';

const accessCodeCharacterClass = `[${ACCESS_CODE_ALPHABET}]`;
export const ACCESS_CODE_PATTERN = new RegExp(
  `^${accessCodeCharacterClass}{${ACCESS_CODE_GROUP_LENGTH}}(?:-${accessCodeCharacterClass}{${ACCESS_CODE_GROUP_LENGTH}}){${ACCESS_CODE_GROUP_COUNT - 1}}$`,
);

function accessCodeCharacters(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[\s-]/g, '');
}

function groupAccessCode(value: string): string {
  return value.match(new RegExp(`.{1,${ACCESS_CODE_GROUP_LENGTH}}`, 'g'))?.join('-') ?? '';
}

export function canonicalizeAccessCode(value: string): string {
  return groupAccessCode(accessCodeCharacters(value));
}

export function formatAccessCodeInput(value: string): string {
  return groupAccessCode(accessCodeCharacters(value).slice(0, ACCESS_CODE_RAW_LENGTH));
}

export function isAccessCode(value: string): boolean {
  return ACCESS_CODE_PATTERN.test(canonicalizeAccessCode(value));
}

export type AccessCodeParts = {
  readonly canonical: string;
  readonly identifier: string;
  readonly secret: string;
};

export function splitAccessCode(value: string): AccessCodeParts | null {
  const canonical = canonicalizeAccessCode(value);
  if (!ACCESS_CODE_PATTERN.test(canonical)) return null;

  const [identifier, ...secretGroups] = canonical.split('-');
  if (!identifier) return null;
  return { canonical, identifier, secret: secretGroups.join('-') };
}

export function internalEmailForAccessCode(value: string): string | null {
  const parts = splitAccessCode(value);
  return parts ? `${parts.identifier}@${ACCESS_CODE_INTERNAL_DOMAIN}` : null;
}
