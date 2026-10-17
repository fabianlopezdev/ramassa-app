/**
 * What `ramassa://dev-menu?language=<code>&account=<email>` asks for (RAPP-500).
 *
 * The smoke suite pins the language and signs in before every flow. Doing that
 * by scrolling the menu and tapping rows cost about 110 seconds per flow, which
 * was a third of the suite. The link does the same two things through the same
 * code the buttons use: `setLanguage`, and a real password sign-in as a seeded
 * account. Only accounts the menu already lists are accepted, and like the rest
 * of this folder it never reaches a release build.
 */

import { SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n';
import {
  DEV_ALL_PLAYER_ACCOUNTS,
  DEV_INVITED_CREDENTIALS,
  DEV_ONBOARDING_CREDENTIALS,
  DEV_STAFF_ACCOUNTS,
} from './dev-accounts';

type Language = (typeof SUPPORTED_LANGUAGES)[number];

export interface DevMenuLinkRequest {
  /** Identifies one request, so a re-render does not apply it twice. */
  readonly key: string;
  readonly language?: Language;
  readonly account?: { readonly email: string; readonly password: string };
  /** What the link asked for that the menu cannot do. */
  readonly problems: readonly string[];
}

const SIGN_IN_ACCOUNTS = [
  ...DEV_STAFF_ACCOUNTS,
  ...DEV_ALL_PLAYER_ACCOUNTS,
  DEV_ONBOARDING_CREDENTIALS,
  DEV_INVITED_CREDENTIALS,
];

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined || first.trim() === '' ? undefined : first.trim();
}

/** Undefined when the menu was opened without a request. */
export function resolveDevMenuLink(params: {
  readonly language?: string | string[];
  readonly account?: string | string[];
}): DevMenuLinkRequest | undefined {
  const language = single(params.language);
  const email = single(params.account)?.toLowerCase();
  if (language === undefined && email === undefined) return undefined;

  const problems: string[] = [];
  const knownLanguage = SUPPORTED_LANGUAGES.find((code) => code === language);
  if (language !== undefined && knownLanguage === undefined) {
    problems.push(`unknown language "${language}"`);
  }
  const account = SIGN_IN_ACCOUNTS.find((candidate) => candidate.email.toLowerCase() === email);
  if (email !== undefined && account === undefined) {
    problems.push(`no seeded account "${email}"`);
  }
  return {
    key: `${language ?? ''}|${email ?? ''}`,
    ...(knownLanguage === undefined ? {} : { language: knownLanguage }),
    ...(account === undefined
      ? {}
      : { account: { email: account.email, password: account.password } }),
    problems,
  };
}
