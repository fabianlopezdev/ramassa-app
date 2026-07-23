import { describe, expect, test } from 'bun:test';
import { parseWorkerEnv } from './env';

const localEnv = {
  UPLOAD_MODE: 'local',
  R2_BUCKET_NAME: 'ramassa-media-dev',
  R2_ACCOUNT_ID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  ALLOWED_ORIGINS: 'http://localhost:3000',
  LOCAL_UPLOAD_SIGNING_SECRET: 'local-secret',
};

const presignedEnv = {
  ...localEnv,
  UPLOAD_MODE: 'r2-presigned',
  R2_ACCESS_KEY_ID: 'key-id',
  R2_SECRET_ACCESS_KEY: 'secret-key',
  LOCAL_UPLOAD_SIGNING_SECRET: '',
};

describe('parseWorkerEnv', () => {
  test('accepts a complete local-mode environment', () => {
    expect(parseWorkerEnv(localEnv).uploadMode).toBe('local');
  });

  test('accepts a complete presigned-mode environment', () => {
    const config = parseWorkerEnv(presignedEnv);
    expect(config.uploadMode).toBe('r2-presigned');
    expect(config.r2AccessKeyId).toBe('key-id');
  });

  test('derives the EU-jurisdiction S3 endpoint from the account id (one value migrates)', () => {
    const config = parseWorkerEnv(presignedEnv);
    expect(config.accountId).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(config.s3Endpoint).toBe(
      'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.eu.r2.cloudflarestorage.com',
    );
  });

  test('refuses a deployment with no account id', () => {
    expect(() => parseWorkerEnv({ ...presignedEnv, R2_ACCOUNT_ID: '' })).toThrow(/R2_ACCOUNT_ID/);
  });

  test('refuses presigned mode without R2 credentials, naming the missing keys', () => {
    expect(() => parseWorkerEnv({ ...presignedEnv, R2_SECRET_ACCESS_KEY: '' })).toThrow(
      /R2_SECRET_ACCESS_KEY/,
    );
  });

  test('refuses local mode without a signing secret', () => {
    expect(() => parseWorkerEnv({ ...localEnv, LOCAL_UPLOAD_SIGNING_SECRET: '' })).toThrow(
      /LOCAL_UPLOAD_SIGNING_SECRET/,
    );
  });

  test('refuses a deployment with no Supabase URL, so tokens can never go unverified', () => {
    expect(() => parseWorkerEnv({ ...presignedEnv, SUPABASE_URL: '' })).toThrow(/SUPABASE_URL/);
  });

  test('parses the allowed-origin list', () => {
    expect(
      parseWorkerEnv({ ...localEnv, ALLOWED_ORIGINS: 'http://a.test, http://b.test' })
        .allowedOrigins,
    ).toEqual(['http://a.test', 'http://b.test']);
  });
});
