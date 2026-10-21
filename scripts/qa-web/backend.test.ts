import { expect, test } from 'bun:test';
import { qaBackend } from './backend';

test('web QA resolves every backend surface together without touching the dev defaults', () => {
  expect(qaBackend({})).toEqual({
    supabaseUrl: 'http://127.0.0.1:54321',
    mailpitUrl: 'http://127.0.0.1:54324',
    databaseContainer: 'supabase_db_ramassa',
  });
  expect(
    qaBackend({
      RAMASSA_QA_SUPABASE_URL: 'http://127.0.0.1:57321',
      RAMASSA_QA_MAILPIT_URL: 'http://127.0.0.1:57324',
      RAMASSA_QA_DB_CONTAINER: 'supabase_db_ramassa-qa',
    }),
  ).toEqual({
    supabaseUrl: 'http://127.0.0.1:57321',
    mailpitUrl: 'http://127.0.0.1:57324',
    databaseContainer: 'supabase_db_ramassa-qa',
  });
});

test('web QA refuses hosted URLs and command fragments', () => {
  for (const url of [
    'https://example.com',
    'http://127.0.0.1:57321/unsafe',
    'http://localhost:57321/$(env)',
  ]) {
    expect(() => qaBackend({ RAMASSA_QA_SUPABASE_URL: url })).toThrow();
  }
  expect(() => qaBackend({ RAMASSA_QA_DB_CONTAINER: 'supabase_db_qa;false' })).toThrow();
});
