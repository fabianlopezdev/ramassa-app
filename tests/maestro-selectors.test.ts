import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import { repoRoot } from '../scripts/flow-capture/config';
import { interpolate, loadTranslator, type Translator } from '../scripts/flow-capture/translations';

type MaestroSelector = string | { id?: string; index?: number; selected?: boolean; text?: string };
type MaestroCommand = Record<string, unknown>;

interface MaestroSpec {
  commands: MaestroCommand[];
  env: Record<string, string>;
  relativePath: string;
}

const auditedSpecs = [
  '.maestro/_open-app.yaml',
  '.maestro/_relaunch.yaml',
  '.maestro/_set-language.yaml',
  '.maestro/_sign-in.yaml',
  '.maestro/smoke-auth.yaml',
  '.maestro/smoke-i18n.yaml',
  '.maestro/smoke-onboarding.yaml',
  '.maestro/smoke-profile.yaml',
  '.maestro/smoke-shells.yaml',
  'maestro/flows/auth-login.yaml',
  'maestro/flows/events-signup.yaml',
  'maestro/flows/home-feed.yaml',
  'maestro/flows/i18n-rtl.yaml',
  'maestro/flows/knowledge-base.yaml',
  'maestro/flows/onboarding.yaml',
  'maestro/flows/profile.yaml',
  'maestro/flows/shell-tabs.yaml',
  'maestro/flows/story-submission.yaml',
] as const;

async function maestroSpecPaths(): Promise<string[]> {
  const directories = ['.maestro', 'maestro/flows'];
  const paths = await Promise.all(
    directories.map(async (directory) =>
      (await readdir(path.join(repoRoot, directory)))
        .filter((file) => file.endsWith('.yaml'))
        .map((file) => path.join(directory, file)),
    ),
  );
  return paths.flat().sort();
}

async function loadSpec(relativePath: string): Promise<MaestroSpec> {
  const source = await Bun.file(path.join(repoRoot, relativePath)).text();
  const separator = source.search(/^---$/m);
  if (separator === -1) throw new Error(`${relativePath} has no Maestro document separator`);
  const header = Bun.YAML.parse(source.slice(0, separator)) as {
    env?: Record<string, string | number>;
  };
  const commands = Bun.YAML.parse(source.slice(separator + 3)) as MaestroCommand[];
  return {
    commands,
    env: Object.fromEntries(
      Object.entries(header.env ?? {}).map(([key, value]) => [key, String(value)]),
    ),
    relativePath,
  };
}

function selectorFrom(value: unknown): MaestroSelector | undefined {
  if (typeof value === 'string') return value;
  if (value === null || typeof value !== 'object') return undefined;
  const selector = value as Exclude<MaestroSelector, string>;
  return selector.text === undefined && selector.id === undefined ? undefined : selector;
}

function selectorIdentity(selector: MaestroSelector): { kind: 'id' | 'text'; value: string } {
  if (typeof selector !== 'string' && selector.id !== undefined) {
    return { kind: 'id', value: selector.id };
  }
  const text = typeof selector === 'string' ? selector : (selector.text ?? '');
  return { kind: 'text', value: text };
}

function nestedCommands(command: MaestroCommand): MaestroCommand[][] {
  const repeat = command.repeat as { commands?: MaestroCommand[] } | undefined;
  const runFlow = command.runFlow as { commands?: MaestroCommand[] } | undefined;
  return [repeat?.commands, runFlow?.commands].filter(
    (commands): commands is MaestroCommand[] => commands !== undefined,
  );
}

function tapsIn(commands: MaestroCommand[]): MaestroSelector[] {
  return commands.flatMap((command) => {
    const own = selectorFrom(command.tapOn);
    return [...(own === undefined ? [] : [own]), ...nestedCommands(command).flatMap(tapsIn)];
  });
}

interface TransitionPair {
  action: MaestroSelector;
  context: string;
  evidence: MaestroSelector;
}

function transitionPairs(commands: MaestroCommand[], prefix = 'root'): TransitionPair[] {
  const pairs: TransitionPair[] = [];
  for (const [index, command] of commands.entries()) {
    const context = `${prefix}.${index}`;
    const action = selectorFrom(command.tapOn);
    if (action !== undefined) {
      let nextIndex = index + 1;
      while (commands[nextIndex]?.waitForAnimationToEnd !== undefined) nextIndex += 1;
      const next = commands[nextIndex];
      const wait = next?.extendedWaitUntil as { visible?: unknown } | undefined;
      const assertion = next?.assertVisible;
      const evidence = selectorFrom(wait?.visible ?? assertion);
      if (evidence !== undefined) pairs.push({ action, evidence, context });
    }

    const repeat = command.repeat as
      { commands?: MaestroCommand[]; while?: { notVisible?: unknown } } | undefined;
    const repeatedEvidence = selectorFrom(repeat?.while?.notVisible);
    if (repeatedEvidence !== undefined && repeat?.commands !== undefined) {
      for (const repeatedAction of tapsIn(repeat.commands)) {
        pairs.push({ action: repeatedAction, evidence: repeatedEvidence, context });
      }
    }

    for (const nested of nestedCommands(command)) {
      pairs.push(...transitionPairs(nested, context));
    }
  }
  return pairs;
}

function resolveSelector(
  selector: MaestroSelector,
  env: Record<string, string>,
  translate: Translator,
): { kind: 'id' | 'text'; value: string } {
  const identity = selectorIdentity(selector);
  const resolvedEnv = Object.fromEntries(
    Object.entries(env).map(([key, value]) => {
      try {
        return [key, interpolate(value, translate)];
      } catch {
        return [key, value];
      }
    }),
  );
  const expanded = identity.value.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (_, key: string) => {
    return resolvedEnv[key] ?? `\${${key}}`;
  });
  return {
    kind: identity.kind,
    value: expanded.replace(/^\.\*/, '').replace(/\.\*$/, '').replace(/^\^/, '').replace(/\$$/, ''),
  };
}

function isQualifiedOutcome(selector: MaestroSelector): boolean {
  return (
    typeof selector !== 'string' &&
    (selector.selected !== undefined || selector.index !== undefined)
  );
}

function tabNavigationEvidence(commands: MaestroCommand[], prefix = 'root'): string[] {
  const violations: string[] = [];
  for (const [index, command] of commands.entries()) {
    const context = `${prefix}.${index}`;
    const repeat = command.repeat as
      { commands?: MaestroCommand[]; while?: { notVisible?: unknown } } | undefined;
    const evidence = selectorFrom(repeat?.while?.notVisible);
    if (evidence !== undefined && repeat?.commands !== undefined) {
      const tapsTab = tapsIn(repeat.commands).some((tap) => {
        const identity = selectorIdentity(tap);
        return identity.kind === 'text' && identity.value.includes('${TAB_');
      });
      if (tapsTab) {
        const identity = selectorIdentity(evidence);
        const isArrivalHeading =
          identity.kind === 'id' || /\$\{[A-Z0-9_]*TITLE(?:_AR)?\}/.test(identity.value);
        if (!isArrivalHeading) violations.push(context);
      }
    }
    for (const nested of nestedCommands(command)) {
      violations.push(...tabNavigationEvidence(nested, context));
    }
  }
  return violations;
}

describe('Maestro selector contracts', () => {
  test('the selector audit inventory covers every committed phone spec', async () => {
    expect(await maestroSpecPaths()).toEqual([...auditedSpecs]);
  });

  test('tab-navigation retries key on an arrival heading, never a below-fold control', async () => {
    const violations: string[] = [];
    for (const relativePath of auditedSpecs) {
      const spec = await loadSpec(relativePath);
      violations.push(
        ...tabNavigationEvidence(spec.commands).map((context) => `${relativePath}:${context}`),
      );
    }
    expect(violations).toEqual([]);
  });

  test('transition evidence cannot reuse the action label unless it is disambiguated', async () => {
    const translators = await Promise.all((['ca', 'ar'] as const).map(loadTranslator));
    const violations = new Set<string>();
    for (const relativePath of auditedSpecs) {
      const spec = await loadSpec(relativePath);
      for (const pair of transitionPairs(spec.commands)) {
        if (isQualifiedOutcome(pair.evidence)) continue;
        for (const translate of translators) {
          const action = resolveSelector(pair.action, spec.env, translate);
          const evidence = resolveSelector(pair.evidence, spec.env, translate);
          if (action.kind === evidence.kind && action.value === evidence.value) {
            violations.add(`${relativePath}:${pair.context}:${action.kind}=${action.value}`);
          }
        }
      }
    }
    expect([...violations]).toEqual([]);
  });

  test('the profile edit proof uses a near-top field and the restored-scroll proof uses its button', async () => {
    const smoke = await Bun.file(path.join(repoRoot, '.maestro/smoke-profile.yaml')).text();
    expect(smoke).toContain("id: 'profile-edit-place-of-birth'");
    expect(smoke).not.toContain("id: 'profile-edit-phone'");
    expect(smoke).toMatch(/Keyed on the EDIT BUTTON[\s\S]*?notVisible: '\^\$\{EDIT_ACTION\}\$'/);
  });

  test('capture flows return from pushed records on fixed tabs before restoring scroll', async () => {
    const events = await Bun.file(path.join(repoRoot, 'maestro/flows/events-signup.yaml')).text();
    const home = await Bun.file(path.join(repoRoot, 'maestro/flows/home-feed.yaml')).text();
    expect(events.match(/visible: '\^\$\{EVENTS_TAB\}\$'/g)).toHaveLength(2);
    expect(events).not.toMatch(
      /tapOn: '\^\$\{BACK\}\$'[\s\S]{0,100}visible: .*\$\{(?:EVENTS_TITLE|LIST_VIEW_ACTION)\}/,
    );
    expect(home).toMatch(/notVisible: '\^\$\{TAB_HOME\}\$'[\s\S]*?visible: '\^\$\{TAB_HOME\}\$'/);
  });
});
