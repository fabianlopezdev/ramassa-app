/**
 * What a player sees and hears on the season authorization, as text, for the
 * seeded published version in all five languages, on her phone and on a staff
 * tablet (RAPP-614).
 *
 * `authorization-render-parity.snapshot.json` was written by the form as it
 * was before the authorization became editable, from the version as it was
 * stored then. The form now reads the new version shape (consent list,
 * questions, texts), and the migration converted every published version to
 * it. This test renders the converted seed version with today's form and
 * requires the same text, phase by phase, so the conversion changed nothing a
 * player sees. Run with AUTHORIZATION_RENDER_WRITE=1 only to record a new
 * baseline on purpose.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { act, fireEvent, render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import i18next from 'i18next';
import { createElement, type ReactNode } from 'react';

const LANGUAGES = ['ca', 'es', 'en', 'ar', 'fa'] as const;
const localesDir = `${import.meta.dir}/../../../../../packages/shared/i18n/locales`;
const i18n = i18next.createInstance();
await i18n.init({
  lng: 'ca',
  fallbackLng: 'ca',
  ns: ['onboarding'],
  defaultNS: 'onboarding',
  interpolation: { escapeValue: false },
  resources: Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      { onboarding: JSON.parse(readFileSync(`${localesDir}/${language}/onboarding.json`, 'utf8')) },
    ]),
  ),
});

let reachDocumentEnd: (() => void) | undefined;
const box = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
mock.module('react-native', () => ({
  View: box,
  Text: box,
  ScrollView: box,
  Linking: { openURL: mock(async () => {}) },
}));
mock.module('react-native-safe-area-context', () => ({ SafeAreaView: box }));
mock.module('@/components/layout/content-width', () => ({ PageWidth: box }));
mock.module('@/components/onboarding/wizard-progress', () => ({
  WizardProgress: ({
    step,
    total,
    flowLabel,
  }: {
    step: number;
    total: number;
    flowLabel: string;
  }) => createElement('nav', null, createElement('span', null, `${step}/${total}`), flowLabel),
}));
mock.module('@/components/forms/data-icon', () => ({ BrandSymbol: () => null }));
mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: () => {} }));
mock.module('@/lib/language-font-class', () => ({ fontClassForLanguage: () => '' }));
mock.module('@/lib/onboarding-entrance', () => ({ useOnboardingEntrance: () => 'none' }));
mock.module('@/lib/use-language-font-class', async () => {
  const { createContext } = await import('react');
  return { ScreenLanguageContext: createContext(null), useLanguageFontClass: () => '' };
});
mock.module('react-i18next', () => ({
  useTranslation: () => ({ t: i18n.getFixedT('ca', 'onboarding'), i18n }),
}));
mock.module('@/components/layout/form-screen', () => ({
  FormScreen: ({
    heading,
    children,
    navigation,
    bottomAction,
    onEndReached,
  }: {
    heading: ReactNode;
    children: ReactNode;
    navigation?: ReactNode;
    bottomAction: ReactNode;
    onEndReached?: () => void;
  }) => {
    reachDocumentEnd = onEndReached;
    return createElement('main', null, navigation, heading, children, bottomAction);
  },
}));
mock.module('@/components/auth/auth-title', () => ({
  AuthTitle: ({ title, subtitle }: { title: string; subtitle?: string }) =>
    createElement('header', null, createElement('h1', null, title), subtitle),
}));
mock.module('@/components/auth/auth-submit-button', () => ({
  AuthSubmitButton: ({ label, onPress }: { label: string; onPress: () => void }) =>
    createElement('button', { onClick: onPress, 'data-testid': 'submit' }, label),
}));
mock.module('@/components/motion/pressable-scale', () => ({
  PressableScale: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children: ReactNode;
    onPress: () => void;
    accessibilityLabel?: string;
  }) =>
    createElement(
      'button',
      { onClick: onPress, 'aria-label': accessibilityLabel, 'data-section': true },
      children,
    ),
}));
mock.module('@/components/motion/drawn-checkmark', () => ({ DrawnCheckmark: () => null }));
mock.module('@/components/forms/selection-choice-surface', () => ({
  SelectionChoiceSurface: ({
    children,
    label,
    onPress,
    testID,
  }: {
    children: ReactNode;
    label: string;
    onPress: () => void;
    testID?: string;
  }) =>
    createElement(
      'button',
      { onClick: onPress, role: 'checkbox', 'aria-label': label, 'data-testid': testID },
      children,
    ),
}));
mock.module('@/components/onboarding/option-chip', () => ({
  OptionChip: ({
    label,
    onPress,
    accessibilityHint,
    testID,
  }: {
    label: string;
    onPress: () => void;
    accessibilityHint?: string;
    testID?: string;
  }) =>
    createElement(
      'button',
      { onClick: onPress, 'aria-description': accessibilityHint, 'data-testid': testID },
      label,
    ),
}));
mock.module('@/components/onboarding/option-grid', () => ({ ChoiceGrid: box }));
mock.module('@/components/auth/auth-text-field', () => ({
  AuthTextField: ({ label }: { label: string }) =>
    createElement('label', null, label, createElement('input', { 'aria-label': label })),
}));
mock.module('@/components/equipment/signature-pad', () => ({
  SignaturePad: ({
    prompt,
    accessibilityLabel,
    accessibilityHint,
  }: {
    prompt: string;
    accessibilityLabel: string;
    accessibilityHint: string;
  }) =>
    createElement(
      'div',
      { role: 'img', 'aria-label': accessibilityLabel, 'aria-description': accessibilityHint },
      prompt,
    ),
}));

const { AuthorizationForm } = await import('./authorization-form');
const { authorizationContentSchema } = await import('@ramassa/shared/authorization');

/** Every text node, accessibility label and hint, in document order. */
function shownText(root: Element): string[] {
  const lines: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? '').trim();
      if (text !== '') lines.push(text);
      return;
    }
    if (node instanceof Element) {
      for (const attribute of ['aria-label', 'aria-description']) {
        const value = node.getAttribute(attribute);
        if (value) lines.push(`[${attribute}] ${value}`);
      }
    }
    node.childNodes.forEach(walk);
  };
  walk(root);
  return lines;
}

const seed = readFileSync(`${import.meta.dir}/../../../../../supabase/seed.sql`, 'utf8');
const content = authorizationContentSchema.parse(
  JSON.parse(seed.match(/\$auth\$([\s\S]*?)\$auth\$/)?.[1] ?? 'null'),
);

function renderAll(language: (typeof LANGUAGES)[number], onTablet: boolean) {
  const view = render(
    createElement(AuthorizationForm, {
      testID: 'authorization-screen',
      content,
      seasonName: '2026/27',
      language,
      isBusy: false,
      hasFailed: false,
      onSubmit: () => {},
      isOtherLanguage: onTablet,
    }),
  );
  const phases: Record<string, string[]> = {};
  // Phase 1: the document, every section opened.
  for (const header of view.container.querySelectorAll('[data-section]')) {
    fireEvent.click(header);
  }
  phases.document = shownText(view.container);
  act(() => reachDocumentEnd?.());
  fireEvent.click(view.getByTestId('submit'));
  // Phase 2: health and emergency contact, with the details field open.
  fireEvent.click(view.getByTestId('authorization-health-yes'));
  phases.health = shownText(view.container);
  fireEvent.click(view.getByTestId('authorization-health-no'));
  fireEvent.click(view.getByTestId('submit'));
  // Phase 3: consents and signature, then with "I cannot draw" ticked.
  phases.consents = shownText(view.container);
  fireEvent.click(view.getByTestId('authorization-cannot-draw'));
  phases.consentsWithoutDrawing = shownText(view.container);
  view.unmount();
  return phases;
}

const snapshotPath = `${import.meta.dir}/authorization-render-parity.snapshot.json`;
const rendered = Object.fromEntries(
  LANGUAGES.flatMap((language) => [
    [`${language}:phone`, renderAll(language, false)],
    [`${language}:tablet`, renderAll(language, true)],
  ]),
);
afterAll(() => mock.restore());

if (process.env.AUTHORIZATION_RENDER_WRITE === '1') {
  writeFileSync(snapshotPath, `${JSON.stringify(rendered, null, 2)}\n`);
}
const baseline = JSON.parse(readFileSync(snapshotPath, 'utf8')) as typeof rendered;

for (const key of Object.keys(baseline)) {
  test(`the published version reads the same after the conversion: ${key}`, () => {
    expect(rendered[key]).toEqual(baseline[key]);
  });
}
