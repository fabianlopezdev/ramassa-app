/**
 * Re-registration shows the wizard's own message under a staff answer that
 * does not fit its question, and sends nothing until it fits (RAPP-610).
 */
import { act, fireEvent, render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import type { CustomAnswerValue, IntakeScreen } from '@ramassa/shared/intake-builder';

const QUESTION = '5eed0000-0000-4000-8045-0000000000aa';
const phoneScreen: IntakeScreen = {
  id: 'season-screen',
  title: { ca: 'Aquesta temporada' },
  intro: null,
  afterScreen: 'season',
  isArchived: false,
  questions: [
    {
      id: QUESTION,
      screenId: 'season-screen',
      type: 'phone',
      label: { ca: 'Telèfon de la persona de contacte' },
      help: null,
      privacy: 'personal',
      placements: ['season'],
      isArchived: false,
      settings: {},
      options: [],
    },
  ],
};
const catalog = {
  screens: [phoneScreen],
  overrides: [],
  presets: [],
  screenSettings: [],
  flowOrder: [],
  terms: null,
};

const mutate = mock<(variables: unknown, options: unknown) => void>(() => {});
mock.module('react-native', () => ({
  ActivityIndicator: () => createElement('span', null, 'loading'),
  ScrollView: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  Text: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
mock.module('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: ReactNode }) => createElement('main', null, children),
}));
mock.module('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly string[] }) => ({
    isPending: false,
    data:
      queryKey[0] === 'reregistration-profile'
        ? {
            first_name: 'Amina',
            last_name: 'Diallo',
            date_of_birth: null,
            nationality: null,
            phone: null,
            address: null,
            city: null,
            clothing_size: null,
            shoe_size: null,
            applicant_status: null,
            supporting_entities: null,
            childcare_need: null,
            specific_needs: null,
          }
        : { catalog, answers: {} },
  }),
  useMutation: () => ({ mutate, isPending: false }),
  // Imported, never called, by modules the screen pulls in.
  useQueryClient: () => ({}),
  useInfiniteQuery: () => ({}),
  QueryClient: class {},
}));
mock.module('@/lib/supabase', () => ({ supabase: {} }));
mock.module('@ramassa/shared/auth', () => ({ useAuth: () => ({ user: { id: 'her' } }) }));
mock.module('expo-router', () => ({ useRouter: () => ({ push: () => {} }) }));
mock.module('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'ca' } }),
}));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: () => {} }));
mock.module('@/lib/onboarding-intake-context', () => ({
  useBuiltinWording: () => ({ label: (_q: string, label: string) => label, help: () => null }),
}));
mock.module('@/components/layout/content-width', () => ({
  PageWidth: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
mock.module('@/components/motion/pressable-scale', () => ({
  PressableScale: ({ testID, onPress }: { testID: string; onPress: () => void }) =>
    createElement('button', { 'data-testid': testID, onClick: onPress }, testID),
}));
mock.module('@/components/profile/profile-section', () => ({
  ProfileSection: ({ children }: { children: ReactNode }) =>
    createElement('section', null, children),
  ProfileRow: () => null,
}));
mock.module('@/components/profile/season-answer-fields', () => ({
  SeasonAnswerFields: () => null,
}));
let answer: (value: CustomAnswerValue) => void = () => {};
mock.module('@/components/onboarding/custom-question-field', () => ({
  CustomQuestionSections: ({
    errors = {},
    onChange,
  }: {
    errors?: Record<string, string>;
    onChange: (id: string, value: CustomAnswerValue) => void;
  }) => {
    answer = (value) => onChange(QUESTION, value);
    return createElement(
      'div',
      null,
      ...Object.entries(errors).map(([id, message]) =>
        createElement('p', { key: id, 'data-testid': `error-${id}` }, message),
      ),
    );
  },
}));

const { ReregistrationSteps } = await import('./reregistration-steps');
afterAll(() => mock.restore());

test('an answer that does not fit shows the wizard message and nothing is sent', () => {
  const screen = render(
    createElement(ReregistrationSteps, { seasonName: '2026', onDone: () => {} }),
  );
  fireEvent.click(screen.getByTestId('reregistration-correct'));
  act(() => answer('600 11'));
  fireEvent.click(screen.getByTestId('reregistration-continue'));
  expect(screen.getByTestId(`error-${QUESTION}`).textContent).toBe('onboarding:errorPhoneFormat');
  expect(mutate).not.toHaveBeenCalled();

  // Corrected, the message goes and the tidied phone is what is sent.
  act(() => answer('+34 600 111 222'));
  fireEvent.click(screen.getByTestId('reregistration-continue'));
  expect(screen.queryByTestId(`error-${QUESTION}`)).toBeNull();
  expect(mutate).toHaveBeenCalledTimes(1);
  const variables = mutate.mock.calls[0]?.[0] as { custom: Record<string, unknown> };
  expect(variables.custom[QUESTION]).toBe('+34600111222');
  screen.unmount();
});
