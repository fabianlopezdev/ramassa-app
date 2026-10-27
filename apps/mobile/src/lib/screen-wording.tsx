/**
 * Staff wording of the built-in wizard screens (RAPP-612).
 *
 * The onboarding layout provides the catalog it loaded with her language, and
 * every wizard frame reads its own screen's title, intro, help line and button
 * labels from it. Staff wording shows only in the language staff wrote it in;
 * anything else is the app's own text in her language. An intro or help line
 * staff cleared shows none; a required text is never blank (RAPP-710, the
 * shared `staffTextIn`). Outside the wizard (profile edit, the terms
 * update) there is no provider, and every frame keeps the app's text.
 *
 * Kept apart from the wizard intake context on purpose: the frame is shared by
 * screens that never load the intake.
 */
import { createContext, use, useMemo, type ReactNode } from 'react';
import {
  editableScreenOf,
  type EditableWizardScreen,
  type ScreenTextField,
} from '@ramassa/shared/intake';
import { builtinScreenText, type IntakeCatalog } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

interface ScreenWordingSource {
  readonly catalog: IntakeCatalog;
  readonly language: LanguageCode;
}

const ScreenWordingContext = createContext<ScreenWordingSource | null>(null);

export function ScreenWordingProvider({
  catalog,
  language,
  children,
}: ScreenWordingSource & { readonly children: ReactNode }) {
  const value = useMemo(() => ({ catalog, language }), [catalog, language]);
  return <ScreenWordingContext value={value}>{children}</ScreenWordingContext>;
}

export interface ScreenWording {
  /** Staff wording for the field in her language ('' when cleared), or the app's own text. */
  readonly text: <Bundled extends string | undefined>(
    field: ScreenTextField,
    bundled: Bundled,
  ) => string | Bundled;
  /** The help line staff wrote under the title, or null when none. */
  readonly help: string | null;
}

/** The wording of one screen from a catalog: pure, for the frame and its tests. */
function screenWording(
  source: ScreenWordingSource | null,
  screen: EditableWizardScreen | null,
): ScreenWording {
  const staff = (field: ScreenTextField) =>
    source === null || screen === null
      ? null
      : builtinScreenText(source.catalog, screen, field, source.language);
  return {
    text: (field, bundled) => staff(field) ?? bundled,
    help: staff('help'),
  };
}

/** The wording of the screen a wizard frame shows, by its stable id. */
export function useScreenWording(screenId: string | undefined): ScreenWording {
  const source = use(ScreenWordingContext);
  const screen = editableScreenOf(screenId);
  return useMemo(() => screenWording(source, screen), [source, screen]);
}

/**
 * A screen's title as staff worded it, for the places that name a screen
 * outside it: the summary sections.
 */
export function useScreenTitle(): (screen: EditableWizardScreen, bundled: string) => string {
  const source = use(ScreenWordingContext);
  return useMemo(
    () => (screen, bundled) => screenWording(source, screen).text('title', bundled),
    [source],
  );
}
