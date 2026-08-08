import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import { repoRoot } from '../scripts/flow-capture/config';
import { interpolate, loadTranslator, type Translator } from '../scripts/flow-capture/translations';

type MaestroSelector =
  string | { checked?: boolean; id?: string; index?: number; selected?: boolean; text?: string };
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
  '.maestro/events-signup.yaml',
  '.maestro/feed-browse.yaml',
  '.maestro/knowledge-story.yaml',
  '.maestro/offline-feed.yaml',
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
    (selector.checked !== undefined ||
      selector.selected !== undefined ||
      selector.index !== undefined)
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

  test('every variable used by a Maestro command is declared or a documented subflow input', async () => {
    const subflowInputs: Partial<Record<(typeof auditedSpecs)[number], ReadonlySet<string>>> = {
      '.maestro/_relaunch.yaml': new Set(['BACK', 'PUSH_DECLINE', 'TAB_HOME']),
    };
    const missing: string[] = [];
    for (const relativePath of auditedSpecs) {
      const spec = await loadSpec(relativePath);
      const referenced = new Set(
        [...JSON.stringify(spec.commands).matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)]
          .map((match) => match[1])
          .filter((variable): variable is string => variable !== undefined),
      );
      for (const variable of referenced) {
        if (!(variable in spec.env) && !subflowInputs[relativePath]?.has(variable)) {
          missing.push(`${relativePath}:${variable}`);
        }
      }
    }
    expect(missing).toEqual([]);
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
    expect(events.match(/visible: '\^\$\{EVENTS_TAB\}\$'/g)).toHaveLength(3);
    expect(events).not.toMatch(
      /tapOn: '\^\$\{BACK\}\$'[\s\S]{0,100}visible: .*\$\{(?:EVENTS_TITLE|LIST_VIEW_ACTION)\}/,
    );
    expect(home).toMatch(/notVisible: '\^\$\{TAB_HOME\}\$'[\s\S]*?visible: '\^\$\{TAB_HOME\}\$'/);
  });

  test('the smoke suite never keys signed-in state on the retired welcome heading', async () => {
    for (const relativePath of auditedSpecs.filter((file) => file.startsWith('.maestro/'))) {
      const source = await Bun.file(path.join(repoRoot, relativePath)).text();
      expect(source).not.toContain('{{home:title}}');
    }

    const signIn = await Bun.file(path.join(repoRoot, '.maestro/_sign-in.yaml')).text();
    expect(signIn).toContain("LOGIN_TITLE: '{{auth:loginTitle}}'");
    expect(signIn).toMatch(/assertNotVisible: '\.\*\$\{LOGIN_TITLE\}\.\*'/);

    const relaunch = await Bun.file(path.join(repoRoot, '.maestro/_relaunch.yaml')).text();
    // Localized defaults in the subflow shadow `runFlow.env` in Maestro. The
    // caller owns these values so an Arabic relaunch cannot silently assert on
    // the Catalan root shell.
    expect(relaunch).not.toContain("BACK: '{{common:back}}'");
    expect(relaunch).not.toContain("TAB_HOME: '{{nav:tabs.home}}'");
    expect(relaunch).not.toContain("PUSH_DECLINE: '{{push:rationaleDecline}}'");
    expect(relaunch).toMatch(
      /notVisible: '\^\$\{TAB_HOME\}\$'[\s\S]*?tapOn:[\s\S]*?text: '\^\$\{BACK\}\$'/,
    );
    expect(relaunch).toMatch(/platform: iOS[\s\S]*?notVisible:[\s\S]*?id: player-tab-home/);
    const tabs = await Bun.file(
      path.join(repoRoot, 'apps/mobile/src/app/(app)/(tabs)/_layout.tsx'),
    ).text();
    expect(tabs).toContain('testID="player-tab-home"');

    for (const relativePath of [
      '.maestro/events-signup.yaml',
      '.maestro/feed-browse.yaml',
      '.maestro/knowledge-story.yaml',
      '.maestro/offline-feed.yaml',
      '.maestro/smoke-auth.yaml',
      '.maestro/smoke-i18n.yaml',
      '.maestro/smoke-shells.yaml',
    ]) {
      const caller = await Bun.file(path.join(repoRoot, relativePath)).text();
      expect(caller).toContain("BACK: '{{common:back}}'");
      expect(caller).toContain("TAB_HOME: '{{nav:tabs.home}}'");
      expect(caller).toContain("PUSH_DECLINE: '{{push:rationaleDecline}}'");
    }

    const setLanguage = await Bun.file(path.join(repoRoot, '.maestro/_set-language.yaml')).text();
    expect(setLanguage).toMatch(
      /visible: '\^Reload app to apply direction\$'[\s\S]*?tapOn: '\^Reload app to apply direction\$'/,
    );

    const auth = await Bun.file(path.join(repoRoot, '.maestro/smoke-auth.yaml')).text();
    expect(auth).toMatch(
      /notVisible: '\.\*\$\{PROFILE_TITLE\}\.\*'[\s\S]*?text: '\^\$\{TAB_PROFILE\}\$'[\s\S]*?visible: '\.\*\$\{PROFILE_TITLE\}\.\*'[\s\S]*?notVisible: '\^\$\{SIGN_OUT\}\$'[\s\S]*?swipe:[\s\S]*?visible: '\^\$\{SIGN_OUT\}\$'[\s\S]*?start: 50%, 60%[\s\S]*?end: 50%, 52%[\s\S]*?text: '\^\$\{SIGN_OUT\}\$'/,
    );

    const profile = await Bun.file(path.join(repoRoot, '.maestro/smoke-profile.yaml')).text();
    expect(profile).toMatch(
      /hideKeyboard[\s\S]*?notVisible: '\.\*\$\{DELETE_CONFIRM_BODY\}\.\*'[\s\S]*?visible: '\^\$\{DELETE_ACTION\}\$'[\s\S]*?tapOn: '\^\$\{DELETE_ACTION\}\$'[\s\S]*?visible: '\.\*\$\{DELETE_CONFIRM_BODY\}\.\*'/,
    );
  });

  test('the Phase 3 smoke flows prove their durable player outcomes', async () => {
    const feed = await Bun.file(path.join(repoRoot, '.maestro/feed-browse.yaml')).text();
    expect(feed).toContain('LOCALE: ca');
    expect(feed).toContain("LANGUAGE_AR: 'العربية'");
    expect(feed).toMatch(/LANGUAGE_AR[\s\S]*?RESTART_AR/);
    expect(feed).not.toContain("notVisible: '^${TAB_HOME_AR}$'");
    expect(feed).toContain("PINNED_CA: '{{home:pinned}}'");
    expect(feed).toMatch(/FILTER_URGENT[\s\S]*?selected: true[\s\S]*?PINNED/);
    expect(feed).toMatch(/FILTER_SOCIAL[\s\S]*?selected: true/);
    expect(feed).toMatch(
      /PINNED[\s\S]*?announcement-detail-screen[\s\S]*?announcement-detail-back[\s\S]*?point: 20%, 50%/,
    );

    const events = await Bun.file(path.join(repoRoot, '.maestro/events-signup.yaml')).text();
    expect(events).toMatch(/CALENDAR_VIEW_ACTION[\s\S]*?player-events-calendar/);
    expect(events).toMatch(/CONFIRM_ACTION[\s\S]*?CONFIRMED_STATUS/);
    expect(events).toMatch(
      /CONFIRMED_STATUS[\s\S]*?- runFlow: _relaunch\.yaml[\s\S]*?CONFIRMED_STATUS/,
    );

    const eventsCapture = await Bun.file(
      path.join(repoRoot, 'maestro/flows/events-signup.yaml'),
    ).text();
    expect(eventsCapture).toMatch(
      /visible: '\^\$\{EVENTS_TAB\}\$'\n\s+timeout: 240000[\s\S]{0,100}?tapOn: '\^\$\{EVENTS_TAB\}\$'/,
    );

    const knowledge = await Bun.file(path.join(repoRoot, '.maestro/knowledge-story.yaml')).text();
    expect(knowledge).toMatch(/open-knowledge-base[\s\S]*?knowledge-detail-screen/);
    expect(knowledge).toMatch(
      /story-title-input[\s\S]*?story-body-input[\s\S]*?story-publication-consent[\s\S]*?story-submit-button/,
    );
    expect(knowledge).toMatch(/story-submit-button[\s\S]*?story-status-submitted/);

    const offline = await Bun.file(path.join(repoRoot, '.maestro/offline-feed.yaml')).text();
    expect(offline).toContain("OFFLINE_BANNER: '{{home:offlineBanner}}'");
    expect(offline).toMatch(/toggleAirplaneMode[\s\S]*?OFFLINE_BANNER/);
    expect(offline).toMatch(/OFFLINE_BANNER[\s\S]*?toggleAirplaneMode/);
  });

  test('the Knowledge Base capture clears a late notification rationale while waiting for Home', async () => {
    const knowledge = await Bun.file(
      path.join(repoRoot, 'maestro/flows/knowledge-base.yaml'),
    ).text();
    const waitsForShortcut = knowledge.match(
      /notVisible:\n\s+id: 'open-knowledge-base'[\s\S]{0,180}?text: '\^\$\{PUSH_DECLINE\}\$'/g,
    );
    expect(waitsForShortcut).toHaveLength(2);
  });

  test('the Home capture clears a delayed notification rationale before screenshots', async () => {
    const source = await Bun.file(path.join(repoRoot, 'maestro/flows/home-feed.yaml')).text();
    const firstScreenshot = source.indexOf('takeScreenshot: ${SHOTS}/01-feed${SUFFIX}');
    const delayedWindow = source.lastIndexOf('times: 4', firstScreenshot);
    expect(delayedWindow).toBeGreaterThan(0);
    expect(source.slice(delayedWindow, firstScreenshot)).toContain("text: '.*Continue.*'");
    expect(source.slice(delayedWindow, firstScreenshot)).toContain("text: '.*Close.*'");
    expect(source.slice(delayedWindow, firstScreenshot)).toContain("text: '^${PUSH_DECLINE}$'");
    expect(source.slice(delayedWindow, firstScreenshot)).toContain('optional: true');
    expect(source.slice(delayedWindow, firstScreenshot)).toContain('openLink: ramassa:///');
  });

  test('every Phase 3 player capture clears delayed notification rationale before navigation', async () => {
    const contracts = [
      ['events-signup.yaml', "- tapOn: '^${EVENTS_TAB}$'"],
      ['knowledge-base.yaml', "- tapOn:\n    id: 'open-knowledge-base'"],
      ['story-submission.yaml', "- tapOn:\n    id: 'open-story-submission'"],
    ] as const;
    for (const [file, navigationTarget] of contracts) {
      const source = await Bun.file(path.join(repoRoot, 'maestro/flows', file)).text();
      const target = source.indexOf(navigationTarget, source.indexOf('stopApp'));
      const delayedWindow = source.lastIndexOf('times: 4\n', target);
      expect(delayedWindow).toBeGreaterThan(0);
      expect(source.slice(delayedWindow, target)).toContain("text: '.*Continue.*'");
      expect(source.slice(delayedWindow, target)).toContain("text: '.*Close.*'");
      expect(source.slice(delayedWindow, target)).toContain("text: '^${PUSH_DECLINE}$'");
      expect(source.slice(delayedWindow, target)).toContain('optional: true');
      expect(source.slice(delayedWindow, target)).toContain('openLink: ramassa:///');
    }
  });
});
