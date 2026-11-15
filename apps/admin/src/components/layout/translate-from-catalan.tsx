/**
 * "Tradueix al castellà" next to the editing language (RAPP-750): one button
 * per editor that rewrites every text of the screen in the chosen language
 * from its Catalan. On the Catalan tab, "Tradueix a totes les altres llengues"
 * does it for every other language at once (RAPP-783): empty languages are
 * filled, and a language that already has words is replaced or kept, as staff
 * choose. Nothing is saved: each section keeps the drafts as typed text until
 * its own Desa.
 *
 * The texts live in several sections, each with its own state (the screen's
 * wording, its title, a legal form's content), so each section registers what
 * it has in Catalan and how it takes the drafts back. `EditorColumns` holds the
 * register and the buttons.
 */

import { ConfirmDialog } from '@/components/onboarding/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  LANGUAGES_FROM_CATALAN,
  translationPlan,
  writtenLanguages,
  type CatalanDrafts,
  type CatalanText,
} from '@/lib/catalan-translation';
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
import type { AppErrorCode } from '@ramassa/shared/errors';
import type { LanguageCode } from '@ramassa/shared/schemas';

export interface TranslatableTexts {
  /**
   * The section's Catalan texts to translate, as they stand now, each with
   * the languages where staff already wrote words for it.
   */
  readonly texts: () => readonly CatalanText[];
  /**
   * Writes each language's drafts; a text with no draft is left alone. With
   * `keepWritten`, a language that already has words for a text keeps them.
   */
  readonly apply: (drafts: CatalanDrafts, keepWritten: boolean) => void;
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
      apply: (drafts, keepWritten) => latest.current.apply(drafts, keepWritten),
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

/** How a run ended: the languages that failed, and the first failure's error. */
export interface TranslationOutcome {
  readonly failed: readonly LanguageCode[];
  readonly isEveryLanguageFailed: boolean;
  readonly error: AppErrorCode | null;
}

/** The register an editor provides, and the runs its buttons start. */
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
  const texts = useCallback(
    () =>
      [...sources.current]
        .flatMap((source) => source.texts())
        .filter((each) => each.text.trim() !== ''),
    [],
  );
  const translate = useCallback(
    async (targets: readonly LanguageCode[], keepWritten: boolean): Promise<TranslationOutcome> => {
      const all = [...sources.current];
      const plan = translationPlan(
        all.flatMap((source) => source.texts()),
        targets,
        keepWritten,
      );
      const asked = new Set([...plan.values()].flat());
      const run = await translateFromCatalan(plan);
      if (run.drafts.size > 0) for (const source of all) source.apply(run.drafts, keepWritten);
      const failed = targets.filter((language) => run.failed.has(language));
      const first = failed[0];
      return {
        failed,
        isEveryLanguageFailed: failed.length > 0 && failed.length === asked.size,
        error: first === undefined ? null : (run.failed.get(first)?.code ?? null),
      };
    },
    [],
  );
  /** One language; null when done, 'nothing' when no Catalan text is there to translate. */
  const run = useCallback(
    async (target: LanguageCode) => {
      if (texts().length === 0) return 'nothing';
      return (await translate([target], false)).error;
    },
    [texts, translate],
  );
  /** The other languages that already have words, or 'nothing' with no Catalan to translate. */
  const written = useCallback(() => {
    const all = texts();
    return all.length === 0 ? 'nothing' : writtenLanguages(all);
  }, [texts]);
  const runAll = useCallback(
    (keepWritten: boolean) => translate(LANGUAGES_FROM_CATALAN, keepWritten),
    [translate],
  );
  return { register, run, written, runAll };
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

/** The look both translate buttons share. */
function TranslateButton({
  label,
  isTranslating,
  testId,
  onClick,
}: {
  readonly label: string;
  readonly isTranslating: boolean;
  readonly testId: string;
  readonly onClick: () => void;
}) {
  const { t } = useTranslation('settings');
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isTranslating}
      data-testid={testId}
      onClick={onClick}
    >
      <Languages aria-hidden="true" />
      {isTranslating ? t('translateFromCatalan.working') : label}
    </Button>
  );
}

/** Only for a language other than Catalan, which every text starts from. */
export function TranslateFromCatalanButton({
  target,
  run,
}: {
  readonly target: LanguageCode;
  /** Null when done; 'nothing' when no Catalan text is there to translate. */
  readonly run: (target: LanguageCode) => Promise<string | null>;
}) {
  const { t } = useTranslation(['settings', 'errors']);
  const [isTranslating, setIsTranslating] = useState(false);
  if (target === 'ca') return null;
  return (
    <TranslateButton
      label={t(`settings:translateFromCatalan.to.${target}`)}
      isTranslating={isTranslating}
      testId="translate-from-catalan"
      onClick={() => {
        setIsTranslating(true);
        void run(target).then((errorCode) => {
          setIsTranslating(false);
          if (errorCode === 'nothing') toast.info(t('settings:translateFromCatalan.nothing'));
          else if (errorCode !== null) toast.error(t(`errors:${errorCode}`));
        });
      }}
    />
  );
}

/**
 * On the Catalan tab: every other language at once. When some already have
 * words, staff choose first whether those are replaced or kept.
 */
export function TranslateToAllButton({
  written,
  runAll,
}: {
  readonly written: () => readonly LanguageCode[] | 'nothing';
  readonly runAll: (keepWritten: boolean) => Promise<TranslationOutcome>;
}) {
  const { t, i18n } = useTranslation(['settings', 'errors']);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  // Kept while the dialog closes, so its text does not change on the way out.
  const [writtenIn, setWrittenIn] = useState<readonly LanguageCode[]>([]);
  const languageList = (languages: readonly LanguageCode[]) =>
    new Intl.ListFormat(i18n.resolvedLanguage ?? 'ca', { type: 'conjunction' }).format(
      languages.map((language) => t(`settings:translateFromCatalan.language.${language}`)),
    );
  const start = (keepWritten: boolean) => {
    setIsAsking(false);
    setIsTranslating(true);
    void runAll(keepWritten).then((outcome) => {
      setIsTranslating(false);
      if (outcome.error === null) return;
      if (outcome.isEveryLanguageFailed) toast.error(t(`errors:${outcome.error}`));
      else {
        toast.error(
          t('settings:translateFromCatalan.failedIn', { languages: languageList(outcome.failed) }),
          { description: t(`errors:${outcome.error}`) },
        );
      }
    });
  };
  return (
    <>
      <TranslateButton
        label={t('settings:translateFromCatalan.toAll')}
        isTranslating={isTranslating}
        testId="translate-to-all"
        onClick={() => {
          const found = written();
          if (found === 'nothing') toast.info(t('settings:translateFromCatalan.nothing'));
          else if (found.length === 0) start(false);
          else {
            setWrittenIn(found);
            setIsAsking(true);
          }
        }}
      />
      <ConfirmDialog
        isOpen={isAsking}
        onOpenChange={setIsAsking}
        title={t('settings:translateFromCatalan.writtenTitle')}
        description={t('settings:translateFromCatalan.writtenBody', {
          languages: languageList(writtenIn),
        })}
        action={t('settings:translateFromCatalan.replace')}
        onConfirm={() => start(false)}
        secondaryAction={{
          label: t('settings:translateFromCatalan.keep'),
          onSelect: () => start(true),
        }}
      />
    </>
  );
}
