/**
 * Turning an authored Maestro flow into a runnable one (RAPP-78, reused by the
 * QA smoke suite in RAPP-20).
 *
 * A flow declares everything variable about itself in its own `env:` block: the
 * translated text it drives the UI by, written as `{{namespace:key}}`, and the
 * run-specific values (`SHOTS`, `LOCALE`, the dev-client URL) as readable
 * defaults. This resolves that block for one run and writes the result to
 * scratch.
 *
 * It has to be a REWRITE rather than `maestro -e`: a flow's own `env:` block
 * WINS over `-e`, so passing overrides on the command line silently runs the
 * file's defaults instead. The failure then reads as a selector that stopped
 * matching, not as a variable that was ignored, which is a long afternoon.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  ONBOARDING_ACCOUNT_EMAIL,
  PARTICIPANT_FIXTURES,
  SEED_ACCOUNT_PASSWORD,
  STAFF_FIXTURES,
} from '@ramassa/shared/testing';
import { repoRoot } from './config';
import { interpolate, type Translator } from './translations';

/**
 * The seeded player every flow signs in as. Taken from the fixture roster rather
 * than re-listed, so it cannot drift from the seed SQL `supabase db reset`
 * rebuilds.
 */
export const capturePlayer = PARTICIPANT_FIXTURES[0];

/**
 * A player with NO pending erasure request. The seed files one against the
 * first participant so the staff queue is never empty, which means her profile
 * shows the "we already received it" banner and the request FORM is
 * unreachable. A capture of that form therefore has to sign in as someone else.
 */
export const capturePlayerWithoutRequest = PARTICIPANT_FIXTURES[1];

/** The seeded admin and entity contact the browser flows sign in as. */
export const captureAdmin = STAFF_FIXTURES.find((person) => person.role === 'admin');
export const captureEntity = STAFF_FIXTURES.find((person) => person.role === 'entity');
/**
 * A staff member who is NOT an admin. `staff:` above is the admin, because most
 * browser flows just need "somebody who can reach the staff area"; this one
 * exists for the flows whose whole point is the difference between the two, such
 * as the RGPD lifecycle, where erasure is offered to an admin and withheld from
 * everybody else.
 */
export const captureStaffOnly = STAFF_FIXTURES.find((person) => person.role === 'staff');

/**
 * Adds the seeded credentials to the translation lookup, so a flow refers to the
 * account it signs in as the same way it refers to a label: by key.
 *
 * Three roles rather than one, because the admin surface routes BY role: the
 * same URL is a staff dashboard for one account and a redirect for another, so
 * a browser flow that can only sign in as a player cannot reach two thirds of
 * the product. Taken from the fixture roster rather than re-listed, so they
 * cannot drift from the seed SQL `supabase db reset` rebuilds.
 */
export function withFixtures(translate: Translator): Translator {
  const accounts: Record<string, string | undefined> = {
    'player:email': capturePlayer?.email,
    'playerWithoutRequest:email': capturePlayerWithoutRequest?.email,
    'staff:email': captureAdmin?.email,
    'staffOnly:email': captureStaffOnly?.email,
    'entity:email': captureEntity?.email,
    // The profile-less account the wizard flows sign in as (RAPP-21).
    'onboarding:email': ONBOARDING_ACCOUNT_EMAIL,
  };
  return (key: string) => {
    if (key in accounts) {
      const email = accounts[key];
      if (email === undefined) {
        throw new Error(`No seeded account for "${key}"; the fixture roster changed shape.`);
      }
      return email;
    }
    // Explicit rather than a `:password` suffix test, which would also swallow
    // any real translation key that happens to end that way.
    if (
      key === 'player:password' ||
      key === 'playerWithoutRequest:password' ||
      key === 'staff:password' ||
      key === 'staffOnly:password' ||
      key === 'entity:password' ||
      key === 'onboarding:password'
    ) {
      return SEED_ACCOUNT_PASSWORD;
    }
    return translate(key);
  };
}

/**
 * Rewrites the header's `env:` block and returns the path of the runnable copy.
 * Only the header is touched, so the flow's commands stay byte-identical to the
 * committed file.
 */
export async function writeResolvedFlow(
  flowFile: string,
  translate: Translator,
  runValues: Record<string, string>,
): Promise<string> {
  const source = await Bun.file(flowFile).text();
  const separator = source.search(/^---$/m);
  if (separator === -1) {
    throw new Error(`${flowFile} has no "---" separating its header from its commands`);
  }
  const resolve = withFixtures(translate);
  const seen = new Set<string>();

  const header = source
    .slice(0, separator)
    .split('\n')
    .map((line) => {
      const match = /^(\s{2})([A-Z][A-Z0-9_]*):\s*(.*?)\s*$/.exec(line);
      const key = match?.[2];
      if (match === null || key === undefined) return line;
      seen.add(key);
      const declared = (match[3] ?? '').replace(/^['"]|['"]$/g, '');
      return `${match[1]}${key}: ${quoteForYaml(runValues[key] ?? interpolate(declared, resolve))}`;
    })
    .join('\n');

  const missing = Object.entries(runValues).filter(([key]) => !seen.has(key));
  if (missing.length > 0) {
    throw new Error(
      `${path.basename(flowFile)} must declare ${missing.map(([key]) => key).join(', ')} ` +
        'in its env block; a Maestro flow cannot pick up a variable it never names.',
    );
  }

  const resolved = path.join(repoRoot, '.flow-shots', path.basename(flowFile));
  await mkdir(path.dirname(resolved), { recursive: true });
  await Bun.write(resolved, header + source.slice(separator));
  return resolved;
}

/** Single-quoted YAML: the only escape inside is a doubled quote. */
function quoteForYaml(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * The deep link that hands a development build its Metro URL. A plain launch
 * lands on the launcher's "searching for development servers" screen instead of
 * the app, so every flow opens this way.
 */
export function devClientUrl(scheme: string, metroPort: number): string {
  return `${scheme}://expo-development-client/?url=${encodeURIComponent(`http://localhost:${metroPort}`)}`;
}
