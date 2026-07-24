/**
 * The dev menu's environment readout (RAPP-19, SPEC "Environment info").
 *
 * Pure on purpose: the screen collects the live values (expo-constants,
 * expo-device, the auth state, the push decision) and hands them here, so every
 * formatting and, more importantly, every REDACTION decision is unit-testable
 * without a device.
 *
 * Secrets are reported as present/absent and never rendered. The anon key is
 * not a secret in the cryptographic sense, but a dev screen gets screenshotted
 * into issues and chats, and "present" answers the only question a developer
 * actually has.
 */

import type { AppRole } from '@ramassa/shared/schemas';

export interface DevEnvironmentInput {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string | undefined;
  readonly sentryDsn: string | undefined;
  readonly commitSha: string | undefined;
  readonly appVersion: string | null;
  readonly nativeBuildVersion: string | null;
  readonly expoSdkVersion: string | null;
  readonly deviceModelName: string | null;
  readonly osName: string | null;
  readonly osVersion: string | null;
  readonly isPhysicalDevice: boolean;
  readonly userId: string | null;
  readonly userEmail: string | null;
  readonly role: AppRole | null;
  /** Unix SECONDS, the unit supabase-js reports on the session. */
  readonly sessionExpiresAt: number | null;
  readonly deviceId: string;
  /** Rendered push-registration decision, including its skip reason. */
  readonly pushRegistration: string;
}

export interface DevEnvironmentRow {
  readonly label: string;
  readonly value: string;
}

const SIGNED_OUT = 'signed out';
const UNKNOWN = 'unknown';

/** Same 12 characters Sentry's `dist` uses, so a dashboard event lines up. */
const COMMIT_SHA_DISPLAY_LENGTH = 12;

function formatExpiry(sessionExpiresAt: number | null, isSignedIn: boolean): string {
  if (!isSignedIn) return SIGNED_OUT;
  if (sessionExpiresAt === null) return UNKNOWN;
  return new Date(sessionExpiresAt * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

/**
 * `resolving` and `signed out` are deliberately different: a null role with a
 * live session means the `profiles` lookup is still in flight or failed, which
 * is a real failure mode worth seeing (it is how a broken RLS policy shows up).
 */
function formatRole(role: AppRole | null, isSignedIn: boolean): string {
  if (!isSignedIn) return SIGNED_OUT;
  return role ?? 'resolving';
}

export function summarizeDevEnvironment(input: DevEnvironmentInput): readonly DevEnvironmentRow[] {
  const isSignedIn = input.userId !== null;

  return [
    { label: 'Supabase URL', value: input.supabaseUrl },
    {
      label: 'Supabase anon key',
      value: input.supabaseAnonKey === undefined ? 'missing' : 'present',
    },
    { label: 'Sentry reporting', value: input.sentryDsn === undefined ? 'off' : 'on' },
    {
      label: 'Commit SHA',
      value:
        input.commitSha === undefined
          ? 'not injected (local build)'
          : input.commitSha.slice(0, COMMIT_SHA_DISPLAY_LENGTH),
    },
    {
      label: 'App version',
      value: `${input.appVersion ?? UNKNOWN} (${input.nativeBuildVersion ?? UNKNOWN})`,
    },
    { label: 'Expo SDK', value: input.expoSdkVersion ?? UNKNOWN },
    {
      label: 'Device',
      value: `${input.deviceModelName ?? UNKNOWN}, ${input.osName ?? UNKNOWN} ${
        input.osVersion ?? UNKNOWN
      } (${input.isPhysicalDevice ? 'physical' : 'simulator'})`,
    },
    { label: 'Device id (push dedupe)', value: input.deviceId },
    { label: 'Push registration', value: input.pushRegistration },
    { label: 'User id', value: input.userId ?? SIGNED_OUT },
    { label: 'User email', value: input.userEmail ?? SIGNED_OUT },
    { label: 'Role', value: formatRole(input.role, isSignedIn) },
    { label: 'Session expires', value: formatExpiry(input.sessionExpiresAt, isSignedIn) },
  ];
}
