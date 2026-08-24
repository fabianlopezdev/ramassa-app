import { describe, expect, test } from 'bun:test';
import { validateDeploymentEnv } from './validate-deployment-env';

const validDeploymentEnv = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://staging-project.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_example',
};

describe('hosted Supabase deployment environment', () => {
  test('accepts an HTTPS hosted project and public client key', () => {
    expect(validateDeploymentEnv(validDeploymentEnv)).toEqual(validDeploymentEnv);
  });

  test('rejects the placeholder host before a build can deploy it', () => {
    expect(() =>
      validateDeploymentEnv({
        ...validDeploymentEnv,
        EXPO_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      }),
    ).toThrow('EXPO_PUBLIC_SUPABASE_URL points to the placeholder project');
  });

  test('rejects local backends that a hosted preview cannot reach', () => {
    expect(() =>
      validateDeploymentEnv({
        ...validDeploymentEnv,
        EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      }),
    ).toThrow('EXPO_PUBLIC_SUPABASE_URL must use HTTPS for deployment');
  });

  test('rejects an empty public key', () => {
    expect(() =>
      validateDeploymentEnv({ ...validDeploymentEnv, EXPO_PUBLIC_SUPABASE_ANON_KEY: '' }),
    ).toThrow('EXPO_PUBLIC_SUPABASE_ANON_KEY is missing');
  });
});
