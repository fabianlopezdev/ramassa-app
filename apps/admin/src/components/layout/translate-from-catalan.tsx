/**
 * "Tradueix al castellà" next to the editing language (RAPP-750): one button
 * per editor that rewrites every text of the screen in the chosen language
 * from its Catalan. Nothing is saved: each section keeps the drafts as typed
 * text until its own Desa.
 *
 * The texts live in several sections, each with its own state (the screen's
 * wording, its title, a legal form's content), so each section registers what
 * it has in Catalan and how it takes the drafts back. `EditorColumns` holds the
 * register and the button.
 */

import { Button } from '@/components/ui/button';
import { translateFromCatalan } from '@/lib/translation-worker';
import { Languages } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { LanguageCode } from '@ramassa/shared/schemas';

export interface TranslatableTexts {
  /** The section's texts in Catalan, as they stand now. */
  readonly texts: () => readonly string[];
  /** Writes the drafts in the target language; a text with no draft is left alone. */
  readonly apply: (target: LanguageCode, drafts: ReadonlyMap<string, string>) => void;
}

interface TranslatableRegister {
  readonly add: (source: TranslatableTexts) => () => void;
}

const TranslatableRegisterContext = createContext<TranslatableRegister | null>(null);

/**
 * A section offers its texts to the editor's button. Outside an editor with
 * the button it does nothing, so a section can sit anywhere.
 */
export function useTranslatableTexts(source: TranslatableTexts): void {
  const register = useContext(TranslatableRegisterContext);
  const latest = useRef(source);
  useLayoutEffect(() => {
    latest.current = source;
  });
  useLayoutEffect(() => {
    if (register === null) return undefined;
    return register.add({
      texts: () => latest.current.texts(),
      apply: (target, drafts) => latest.current.apply(target, drafts),
    });
  }, [register]);
}

/** An editor's own texts, held where it renders `EditorColumns`. */
export function TranslatableSource({ source }: { readonly source: TranslatableTexts }) {
  useTranslatableTexts(source);
  return null;
}

/**
 * Writes into a box React does not hold (the five-language fields keep their
 * text in the page), then tells its form, so the preview reads it as typed.
 */
export function typeInto(box: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const prototype =
    box instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(box, text);
  box.dispatchEvent(new Event('input', { bubbles: true }));
}

/** The register an editor provides, and the run its button starts. */
export function useTranslatableRegister() {
  const sources = useRef(new Set<TranslatableTexts>());
  const register = useMemo<TranslatableRegister>(
    () => ({
      add(source) {
        sources.current.add(source);
        return () => sources.current.delete(source);
      },
    }),
    [],
  );
  const run = useCallback(async (target: LanguageCode) => {
    const all = [...sources.current];
    const result = await translateFromCatalan(
      all.flatMap((source) => source.texts()),
      target,
    );
    if (!result.ok) return result.error.code;
    for (const source of all) source.apply(target, result.value);
    return null;
  }, []);
  return { register, run };
}

export function TranslatableRegisterProvider({
  register,
  children,
}: {
  readonly register: TranslatableRegister;
  readonly children: ReactNode;
}) {
  return (
    <TranslatableRegisterContext.Provider value={register}>
      {children}
    </TranslatableRegisterContext.Provider>
  );
}

/** Only for a language other than Catalan, which every text starts from. */
export function TranslateFromCatalanButton({
  target,
  run,
}: {
  readonly target: LanguageCode;
  readonly run: (target: LanguageCode) => Promise<string | null>;
}) {
  const { t } = useTranslation(['settings', 'errors']);
  const [isTranslating, setIsTranslating] = useState(false);
  if (target === 'ca') return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isTranslating}
      data-testid="translate-from-catalan"
      onClick={() => {
        setIsTranslating(true);
        void run(target).then((errorCode) => {
          setIsTranslating(false);
          if (errorCode !== null) toast.error(t(`errors:${errorCode}`));
        });
      }}
    >
      <Languages aria-hidden="true" />
      {isTranslating
        ? t('settings:translateFromCatalan.working')
        : t(`settings:translateFromCatalan.to.${target}`)}
    </Button>
  );
}
