import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useRouter } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { customStepKey, DETAIL_SCREEN_BRANCHES } from '@ramassa/shared/intake';
import {
  deleteBuilderScreen,
  flowStep,
  flowStepName,
  formScreenParent,
  isDetailScreen,
  textIn,
  type CustomForm,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { boardNumbers } from './board-steps';
import { ConfirmDialog } from './confirm-dialog';

export interface ScreenDeletion {
  readonly key: string;
  readonly name: string;
  readonly dependents: readonly {
    readonly key: string;
    readonly name: string;
    readonly number: string;
  }[];
  readonly run: () => Promise<void>;
}

/** Include screens whose gate is on an app follow-up, even when the board places them separately. */
function onboardingDeletionKeys(catalog: IntakeCatalog, root: string): readonly string[] {
  const keys = new Set([root]);
  for (const key of keys) {
    for (const branch of DETAIL_SCREEN_BRANCHES) {
      if (
        branch.parent === key &&
        !catalog.screenSettings?.some((s) => s.screen === branch.screen && s.isDeleted)
      )
        keys.add(branch.screen);
    }
    const screenKey = key.startsWith('custom:') ? key.slice(7) : key;
    for (const screen of catalog.screens) {
      if (
        !screen.isArchived &&
        screen.showWhen !== undefined &&
        catalog.layout?.placements.some(
          (placement) =>
            placement.surface === 'onboarding' &&
            placement.screenKey === screenKey &&
            placement.fieldId === screen.showWhen?.fieldId,
        )
      )
        keys.add(customStepKey(screen.id));
    }
  }
  return [...keys];
}

export function onboardingDeletion(
  catalog: IntakeCatalog,
  key: string,
  language: LanguageCode,
  t: (key: string) => string,
): ScreenDeletion | undefined {
  // These cards represent complete forms, not screens of Onboarding.
  if (key === 'terms' || key === 'terms-intro' || key === 'authorization') return undefined;
  const nameOf = (each: string) => {
    if (isDetailScreen(each)) return t(`settings:builtinScreens.screenName.${each}`);
    const step = flowStep(catalog, each);
    return step === null ? '' : flowStepName(step, language, t);
  };
  const name = nameOf(key);
  if (!name || catalog.screenSettings?.some((s) => s.screen === key && s.isDeleted))
    return undefined;
  const numbers = boardNumbers(catalog);
  const family = onboardingDeletionKeys(catalog, key);
  return {
    key,
    name,
    dependents: family
      .slice(1)
      .map((member) => ({ key: member, name: nameOf(member), number: numbers.get(member) ?? '' })),
    run: () => deleteBuilderScreen(supabase, 'onboarding', key, family),
  };
}

export function customFormDeletion(
  catalog: IntakeCatalog,
  form: CustomForm,
  key: string,
  language: LanguageCode,
  numbers: ReadonlyMap<string, string>,
): ScreenDeletion {
  const nameOf = (each: string) =>
    textIn(form.screens.find((screen) => screen.id === each)?.title ?? {}, language);
  const family = new Set([key]);
  for (const parent of family) {
    for (const screen of form.screens) {
      if (formScreenParent(catalog, form, screen) === parent) family.add(screen.id);
    }
  }
  return {
    key,
    name: nameOf(key),
    dependents: [...family]
      .slice(1)
      .map((member) => ({ key: member, name: nameOf(member), number: numbers.get(member) ?? '' })),
    run: () => deleteBuilderScreen(supabase, 'custom_form', key, [...family]),
  };
}

/** One confirmation for the board's trash icon and the editor's destructive button. */
export function DeleteScreenAction({
  deletion,
  variant,
  onDeleted,
}: {
  readonly deletion: ScreenDeletion;
  readonly variant: 'icon' | 'button';
  readonly onDeleted?: () => Promise<unknown>;
}) {
  const { t } = useTranslation('settings');
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  async function remove() {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await deletion.run();
      await onDeleted?.();
      await router.invalidate({ sync: true });
      setIsOpen(false);
      toast.success(t('onboardingBoard.deleted', { screen: deletion.name }));
    } catch {
      toast.error(t('onboardingBoard.deleteFailed'));
    } finally {
      setIsBusy(false);
    }
  }
  const label = t('onboardingBoard.deleteNamedScreen', { screen: deletion.name });
  return (
    <>
      <Button
        type="button"
        variant={variant === 'icon' ? 'ghost' : 'destructive'}
        size={variant === 'icon' ? 'icon-sm' : 'default'}
        className={variant === 'icon' ? 'text-destructive hover:text-destructive' : undefined}
        aria-label={label}
        title={variant === 'icon' ? label : undefined}
        disabled={isBusy}
        onClick={() => setIsOpen(true)}
        data-testid={variant === 'icon' ? `board-delete-${deletion.key}` : 'screen-delete'}
      >
        <Trash2 aria-hidden data-icon={variant === 'icon' ? undefined : 'inline-start'} />
        {variant === 'button' ? t('onboardingBoard.deleteScreen') : null}
      </Button>
      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!isBusy) setIsOpen(open);
        }}
        title={t('onboardingBoard.deleteNamedScreenTitle', { screen: deletion.name })}
        description={t('onboardingBoard.deleteScreenBody')}
        action={t('onboardingBoard.delete')}
        isBusy={isBusy}
        onConfirm={() => void remove()}
      >
        {deletion.dependents.length === 0 ? null : (
          <div
            className="flex min-h-0 flex-col gap-2 text-start text-sm"
            data-testid="screen-delete-dependents"
          >
            <p>{t('onboardingBoard.deleteDependentScreens')}</p>
            <ul className="max-h-60 list-disc overflow-y-auto ps-5">
              {deletion.dependents.map((screen) => (
                <li key={screen.key}>
                  {screen.number === ''
                    ? screen.name
                    : `${t('onboardingBoard.step', { number: screen.number })}: ${screen.name}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
