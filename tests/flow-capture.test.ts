/**
 * The flow-capture harness (RAPP-78).
 *
 * Everything a capture decides BEFORE it touches a device is pure, and that is
 * what is asserted here: which passes a flow needs, which slugs a closure gate
 * owns, what a manifest looks like once only the captured images are left, and
 * that nothing internal can leak into a canvas the client sees. The parts that
 * drive a simulator are exercised by running a real capture, not by mocking one.
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  findFlow,
  flowsForPhase,
  loadFlowConfig,
  localeSuffix,
  repoRoot,
  resolvePasses,
} from '../scripts/flow-capture/config';
import {
  assertClientSafe,
  resolveManifest,
  type FlowManifest,
} from '../scripts/flow-capture/manifest';
import { interpolate, loadTranslator } from '../scripts/flow-capture/translations';

const config = await loadFlowConfig();

describe('capture passes', () => {
  test('a bare player flow captures both phones AND the browser', () => {
    expect(resolvePasses('mobile')).toEqual(['ios', 'android', 'web']);
  });

  test('--platform narrows a player flow', () => {
    expect(resolvePasses('mobile', 'ios')).toEqual(['ios']);
    expect(resolvePasses('mobile', 'both')).toEqual(['ios', 'android']);
    expect(resolvePasses('mobile', 'web')).toEqual(['web']);
  });

  test('admin and entity flows are browser-only', () => {
    expect(resolvePasses('admin')).toEqual(['web']);
    expect(resolvePasses('entity')).toEqual(['web']);
  });

  test('asking for a phone pass on a browser surface is an error, not a silent skip', () => {
    expect(() => resolvePasses('admin', 'ios')).toThrow(/does not apply/);
  });
});

describe('phase selection', () => {
  test('a bare phase number claims its lettered halves', () => {
    const slugs = flowsForPhase(config, '5').map((flow) => flow.slug);
    expect(slugs).toContain('services-directory');
    expect(slugs).toContain('messaging');
  });

  test('a lettered phase claims only its own half', () => {
    const slugs = flowsForPhase(config, '5b').map((flow) => flow.slug);
    expect(slugs).toEqual(['messaging', 'admin-conversations']);
  });

  test('every phase-1 flow is listed', () => {
    expect(flowsForPhase(config, '1').map((flow) => flow.slug)).toEqual([
      'auth-login',
      'shell-tabs',
      'i18n-rtl',
      'admin-login',
    ]);
  });
});

describe('the flow inventory', () => {
  test('holds all 44 flows across the three surfaces', () => {
    const bySurface = (surface: string) =>
      config.flows.filter((flow) => flow.surface === surface).length;
    expect(config.flows).toHaveLength(44);
    expect(bySurface('mobile')).toBe(18);
    expect(bySurface('admin')).toBe(23);
    expect(bySurface('entity')).toBe(3);
  });

  test('slugs are unique', () => {
    expect(new Set(config.flows.map((flow) => flow.slug)).size).toBe(config.flows.length);
  });

  test('an unknown slug fails with the list of known ones', () => {
    expect(() => findFlow(config, 'nope')).toThrow(/Unknown flow "nope"/);
  });
});

describe('resolving a manifest against what was captured', () => {
  const authored: FlowManifest = {
    app: 'Ramassà',
    slug: 'demo',
    title: 'Demo',
    surface: 'mobile',
    description: 'Two screens',
    steps: [
      { id: 'one', label: 'Un', ios: 'demo/ios/01.png', android: 'demo/android/01.png' },
      { id: 'two', label: 'Dos', ios: 'demo/ios/02.png' },
    ],
    edges: [{ from: 'one', to: 'two', label: 'Continua' }],
  };

  test('keeps only the platforms that produced an image', () => {
    const resolved = resolveManifest(
      authored,
      (file) => file.startsWith('demo/ios/'),
      '2026-07-25',
    );
    expect(resolved.steps[0]).toEqual({ id: 'one', label: 'Un', ios: 'demo/ios/01.png' });
  });

  test('drops a step with no image, and the edges pointing at it', () => {
    const resolved = resolveManifest(authored, (file) => file === 'demo/ios/01.png', '2026-07-25');
    expect(resolved.steps.map((step) => step.id)).toEqual(['one']);
    expect(resolved.edges).toBeUndefined();
  });

  test('stamps the capture date', () => {
    expect(resolveManifest(authored, () => true, '2026-07-25').capturedAt).toBe('2026-07-25');
  });
});

describe('client safety', () => {
  const base: FlowManifest = {
    app: 'Ramassà',
    slug: 'demo',
    title: 'Demo',
    surface: 'mobile',
    description: 'Clean',
    steps: [{ id: 'one', label: 'Un', ios: 'demo/ios/01.png' }],
  };

  test('an issue ID in a note is refused', () => {
    expect(() => assertClientSafe({ ...base, notes: ['Fixed in RAPP-16'] }, 'demo')).toThrow(
      /issue ID/,
    );
  });

  test('a wikilink in a description is refused', () => {
    expect(() => assertClientSafe({ ...base, description: 'See [[Ramassa-App]]' }, 'demo')).toThrow(
      /wikilink/,
    );
  });

  test('image paths are not client-visible text', () => {
    expect(() => assertClientSafe(base, 'demo')).not.toThrow();
  });

  test('every authored manifest in the repo is clean', async () => {
    const flowsDir = path.join(repoRoot, 'flows');
    const manifests = (await readdir(flowsDir)).filter((file) => file.endsWith('.manifest.json'));
    expect(manifests.length).toBeGreaterThan(0);
    for (const file of manifests) {
      const manifest = (await Bun.file(path.join(flowsDir, file)).json()) as FlowManifest;
      expect(() => assertClientSafe(manifest, file)).not.toThrow();
    }
  });
});

describe('locale-aware selectors', () => {
  test('the suffix keeps both language passes in one folder', () => {
    expect(localeSuffix('ca')).toBe('');
    expect(localeSuffix('ar')).toBe('-ar');
  });

  test('a flow reads its screen names out of the app catalogs, per locale', async () => {
    const ca = await loadTranslator('ca');
    const ar = await loadTranslator('ar');
    expect(interpolate('{{nav:tabs.events}}', ca)).toBe('Calendari');
    expect(interpolate('{{nav:tabs.events}}', ar)).toBe('الفعاليات');
  });

  test('a missing key fails loudly rather than driving the UI by an empty string', async () => {
    const ca = await loadTranslator('ca');
    expect(() => interpolate('{{nav:tabs.nope}}', ca)).toThrow(/missing/);
  });

  test('tokens are replaced everywhere in a spec, not only at the top level', async () => {
    const ca = await loadTranslator('ca');
    expect(interpolate({ steps: [{ waitFor: 'text={{nav:tabs.profile}}' }] }, ca)).toEqual({
      steps: [{ waitFor: 'text=Perfil' }],
    });
  });
});

describe('every declared flow can eventually be captured', () => {
  test('a slug with a manifest also has the capture spec its surface needs', async () => {
    const flowsDir = path.join(repoRoot, 'flows');
    const authored = (await readdir(flowsDir))
      .filter((file) => file.endsWith('.manifest.json'))
      .map((file) => file.replace('.manifest.json', ''));
    for (const slug of authored) {
      const entry = findFlow(config, slug);
      for (const pass of resolvePasses(entry.surface)) {
        const spec =
          pass === 'web'
            ? path.join(repoRoot, 'maestro', 'web', `${slug}.web.json`)
            : path.join(repoRoot, 'maestro', 'flows', `${slug}.yaml`);
        expect(await Bun.file(spec).exists()).toBe(true);
      }
    }
  });

  test('new player flows dismiss the dev-client first-run prompt after clearing state', async () => {
    for (const slug of ['knowledge-base', 'story-submission']) {
      const spec = await Bun.file(path.join(repoRoot, 'maestro', 'flows', `${slug}.yaml`)).text();
      expect(spec).toContain("'.*Continue.*'");
    }
  });

  test('story submission captures both review confirmation and the abandon-draft branch', async () => {
    const manifest = (await Bun.file(
      path.join(repoRoot, 'flows', 'story-submission.manifest.json'),
    ).json()) as FlowManifest;

    for (const suffix of ['', '-ar']) {
      const abandoned = manifest.steps.find((step) => step.id === `abandoned${suffix}`);
      expect(abandoned?.ios).toBeDefined();
      expect(abandoned?.android).toBeDefined();
      expect(abandoned?.web).toBeDefined();
      expect(manifest.steps.some((step) => step.id === `submitted${suffix}`)).toBe(true);
      expect(manifest.edges).toContainEqual({
        from: `form${suffix}`,
        to: `abandoned${suffix}`,
        label: expect.any(String),
        kind: 'dismiss',
      });
    }
  });
});
