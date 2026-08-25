import { expect, test } from 'bun:test';
import {
  ACCESS_CODE_ALPHABET,
  ACCESS_CODE_PATTERN,
  canonicalizeAccessCode,
  formatAccessCodeInput,
  isAccessCode,
  splitAccessCode,
} from './access-code';

test('canonicalizes case, whitespace, and missing separators into 4-4-4 groups', () => {
  expect(canonicalizeAccessCode('  ABCD efgh JKMP  ')).toBe('abcd-efgh-jkmp');
  expect(canonicalizeAccessCode('abcd-efgh-jkmp')).toBe('abcd-efgh-jkmp');
});

test('formats incremental phone input without accepting more than twelve characters', () => {
  expect(formatAccessCodeInput('ABCD')).toBe('abcd');
  expect(formatAccessCodeInput('ABCDEFGH')).toBe('abcd-efgh');
  expect(formatAccessCodeInput('ABCD EFGH JKMP EXTRA')).toBe('abcd-efgh-jkmp');
});

test('accepts only the unambiguous SQL alphabet and rejects near misses', () => {
  expect(ACCESS_CODE_ALPHABET).toBe('abcdefghjkmnpqrstuvwxyz23456789');
  expect(ACCESS_CODE_PATTERN.test('abcd-efgh-jkmp')).toBe(true);
  expect(isAccessCode('ABCD EFGH JKMP')).toBe(true);

  for (const nearMiss of [
    'abcd-efgh-jkm1',
    'abcd-efgh-jkmo',
    'abcd-efgh-jkml',
    'abcd-efgh-jkmр',
    'abcd-efgh-jkm',
    'abcd-efgh-jkmpp',
  ]) {
    expect(isAccessCode(nearMiss)).toBe(false);
  }
});

test('splits the public identifier from the two secret groups', () => {
  expect(splitAccessCode('ABCD EFGH JKMP')).toEqual({
    canonical: 'abcd-efgh-jkmp',
    identifier: 'abcd',
    secret: 'efgh-jkmp',
  });
  expect(splitAccessCode('wrong')).toBeNull();
});
