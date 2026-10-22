/**
 * The built-in onboarding screens (RAPP-612): the order of every screen and
 * the wording of each built-in one, with a live preview of her phone.
 *
 * The order lists the built-in question screens and the organization's own
 * screens in one list; staff move them up and down and save. The summary, the
 * terms introduction, the terms and the season authorization always end the
 * onboarding (legal), so they show below the list, locked. A built-in screen
 * none of whose questions is required can be hidden.
 *
 * The wording is per screen and per language: title, intro, help line and
 * button labels. A language left empty shows the app's own text in that
 * language, which the field shows as its placeholder and the preview uses.
 * The terms screens take their title and intro from the app terms version.
 * Validation messages stay in the app.
 */

import { AdminAuthField } from '@/components/auth/admin-auth-field';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getLanguageDirection,
  LANGUAGE_NATIVE_NAMES,
  SUPPORTED_LANGUAGES,
} from '@ramassa/shared/i18n/languages';
import {
  BUNDLED_SCREEN_TEXT_KEYS,
  customStepId,
  DETAIL_SCREEN_PARENTS,
  EDITABLE_WIZARD_SCREENS,
  isCustomStep,
  resolveAppTerms,
  screenTextFields,
  WIZARD_QUESTION_SCREENS,
  wizardFlowOrder,
  type EditableWizardScreen,
  type ScreenTextField,
  type WizardQuestionScreen,
  type WizardStepKey,
} from '@ramassa/shared/intake';
import {
  canHideBuiltinScreen,
  moved,
  screenSettingsFor,
  textIn,
  wizardFlow,
  wizardScreens,
  type BuilderText,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export interface BuiltinScreenDraft {
  readonly screen: EditableWizardScreen;
  readonly texts: Readonly<Partial<Record<ScreenTextField, BuilderText>>>;
  readonly isHidden: boolean;
}

export interface BuiltinScreensEditorProps {
  readonly catalog: IntakeCatalog;
  readonly onSaveScreen: (draft: BuiltinScreenDraft) => Promise<void>;
  /** The movable steps in order; an empty list goes back to the app's own order. */
  readonly onSaveOrder: (order: readonly WizardStepKey[]) => Promise<void>;
}

/** The screens that always end the onboarding, shown locked under the order. */
const FIXED_FINAL_STEPS = ['summary', 'terms-intro', 'terms', 'authorization'] as const;

type Status = 'idle' | 'saving' | 'saved' | 'failed';

function isQuestionScreen(screen: string): screen is WizardQuestionScreen {
  return (WIZARD_QUESTION_SCREENS as readonly string[]).includes(screen);
}

export function BuiltinScreensEditor({
  catalog,
  onSaveScreen,
  onSaveOrder,
}: BuiltinScreensEditorProps) {
  return (
    <div className="flex max-w-6xl flex-col gap-6" data-testid="builtin-screens-editor">
      <FlowOrderPanel catalog={catalog} onSaveOrder={onSaveOrder} />
      <ScreenWordingPanel catalog={catalog} onSaveScreen={onSaveScreen} />
    </div>
  );
}

function FlowOrderPanel({
  catalog,
  onSaveOrder,
}: {
  readonly catalog: IntakeCatalog;
  readonly onSaveOrder: (order: readonly WizardStepKey[]) => Promise<void>;
}) {
  const { t, i18n } = useTranslation(['settings', 'onboarding']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const customScreens = wizardScreens(catalog);
  const flow = wizardFlow(catalog);
  const [order, setOrder] = useState<readonly WizardStepKey[]>(() =>
    wizardFlowOrder(
      customScreens.map((screen) => ({
        id: screen.id,
        afterScreen: screen.afterScreen,
        isAnswered: false,
      })),
      flow,
    ).filter((step) => !(['summary', 'terms-intro', 'terms'] as readonly string[]).includes(step)),
  );
  const [status, setStatus] = useState<Status>('idle');

  const stepName = (step: WizardStepKey): string => {
    const id = customStepId(step);
    if (id === null) return t(`settings:builtinScreens.screenName.${step}`);
    const screen = customScreens.find((candidate) => candidate.id === id);
    return screen === undefined ? step : textIn(screen.title, language);
  };

  async function save(next: readonly WizardStepKey[]) {
    setStatus('saving');
    try {
      await onSaveOrder(next);
      setStatus('saved');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5" data-testid="flow-order">
      <div className="flex flex-col gap-1">
        <h3 className="text-start text-base font-semibold">{t('builtinScreens.orderTitle')}</h3>
        <p className="text-start text-sm text-muted-foreground">{t('builtinScreens.orderIntro')}</p>
      </div>
      <ol className="flex flex-col divide-y rounded-lg border" data-testid="flow-order-steps">
        {order.map((step, index) => (
          <li
            key={step}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            data-testid={`flow-step-${step}`}
          >
            <span className="flex flex-wrap items-center gap-2 text-start text-sm">
              <span className="tabular-nums text-muted-foreground">{index + 1}.</span>
              <span className="font-medium">{stepName(step)}</span>
              {isCustomStep(step) ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {t('builtinScreens.staffScreenBadge')}
                </span>
              ) : null}
              {!isCustomStep(step) && flow.hiddenScreens.has(step as WizardQuestionScreen) ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {t('builtinScreens.hiddenBadge')}
                </span>
              ) : null}
            </span>
            <span className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={index === 0}
                aria-label={t('builtinScreens.moveUp', { screen: stepName(step) })}
                onClick={() => {
                  setOrder(moved(order, step, -1) as readonly WizardStepKey[]);
                  setStatus('idle');
                }}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={index === order.length - 1}
                aria-label={t('builtinScreens.moveDown', { screen: stepName(step) })}
                onClick={() => {
                  setOrder(moved(order, step, 1) as readonly WizardStepKey[]);
                  setStatus('idle');
                }}
              >
                ↓
              </Button>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-1 rounded-lg border border-dashed p-3">
        <p className="text-start text-sm font-medium">{t('builtinScreens.fixedTitle')}</p>
        <ol className="flex flex-col gap-1" data-testid="flow-order-fixed">
          {FIXED_FINAL_STEPS.map((step, index) => (
            <li key={step} className="text-start text-sm text-muted-foreground">
              {order.length + index + 1}. {t(`builtinScreens.screenName.${step}`)}
            </li>
          ))}
        </ol>
      </div>
      {status === 'failed' ? (
        <p role="alert" className="text-start text-sm text-destructive">
          {t('builtinScreens.failed')}
        </p>
      ) : null}
      {status === 'saved' ? (
        <p aria-live="polite" className="text-start text-sm text-muted-foreground">
          {t('builtinScreens.orderSaved')}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={status === 'saving'}
          onClick={() => void save(order)}
          data-testid="flow-order-save"
        >
          {t('builtinScreens.saveOrder')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={status === 'saving'}
          onClick={() => void save([])}
          data-testid="flow-order-reset"
        >
          {t('builtinScreens.resetOrder')}
        </Button>
      </div>
    </section>
  );
}

function ScreenWordingPanel({
  catalog,
  onSaveScreen,
}: {
  readonly catalog: IntakeCatalog;
  readonly onSaveScreen: (draft: BuiltinScreenDraft) => Promise<void>;
}) {
  const { t } = useTranslation('settings');
  const [screen, setScreen] = useState<EditableWizardScreen>('identity');
  return (
    <section
      className="flex flex-col gap-4 rounded-xl border bg-card p-5"
      data-testid="screen-wording"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-start text-base font-semibold">{t('builtinScreens.wordingTitle')}</h3>
        <p className="text-start text-sm text-muted-foreground">
          {t('builtinScreens.wordingIntro')}
        </p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        <span>{t('builtinScreens.screen')}</span>
        <select
          id="builtin-screen-select"
          value={screen}
          onChange={(event) => setScreen(event.target.value as EditableWizardScreen)}
          className="h-9 max-w-sm rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {EDITABLE_WIZARD_SCREENS.map((option) => (
            <option key={option} value={option}>
              {t(`builtinScreens.screenName.${option}`)}
            </option>
          ))}
        </select>
      </label>
      {/* Keyed by the screen: switching screens starts from what is saved. */}
      <ScreenWordingForm
        key={screen}
        catalog={catalog}
        screen={screen}
        onSaveScreen={onSaveScreen}
      />
    </section>
  );
}

function ScreenWordingForm({
  catalog,
  screen,
  onSaveScreen,
}: {
  readonly catalog: IntakeCatalog;
  readonly screen: EditableWizardScreen;
  readonly onSaveScreen: (draft: BuiltinScreenDraft) => Promise<void>;
}) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const saved = screenSettingsFor(catalog, screen);
  const [language, setLanguage] = useState<LanguageCode>('ca');
  const [texts, setTexts] = useState<Partial<Record<ScreenTextField, BuilderText>>>(
    saved?.texts ?? {},
  );
  const [isHidden, setIsHidden] = useState(saved?.isHidden ?? false);
  const [status, setStatus] = useState<Status>('idle');
  const fields = screenTextFields(screen);
  const direction = getLanguageDirection(language);
  // The app's own text in the chosen language, whatever the dashboard's language.
  const bundled = (field: ScreenTextField): string | undefined => {
    const key = BUNDLED_SCREEN_TEXT_KEYS[screen][field];
    return key === undefined ? undefined : t(`onboarding:${key}`, { lng: language });
  };
  const staff = (field: ScreenTextField): string => texts[field]?.[language]?.trim() ?? '';
  const shown = (field: ScreenTextField): string | undefined => staff(field) || bundled(field);
  const hideable = isQuestionScreen(screen) && canHideBuiltinScreen(screen);
  const isTermsScreen = screen === 'terms-intro' || screen === 'terms';
  const terms =
    catalog.terms === null || catalog.terms === undefined
      ? null
      : resolveAppTerms(catalog.terms.content, language);
  const title = isTermsScreen
    ? screen === 'terms'
      ? terms?.title
      : terms?.introTitle
    : shown('title');
  const intro = isTermsScreen
    ? screen === 'terms'
      ? terms?.mediaHint
      : terms?.intro
    : shown('intro');
  const usesBundled = fields.some((field) => staff(field) === '' && bundled(field) !== undefined);

  const edit = (field: ScreenTextField, value: string) => {
    setTexts({ ...texts, [field]: { ...texts[field], [language]: value } });
    setStatus('idle');
  };

  async function save() {
    setStatus('saving');
    try {
      await onSaveScreen({ screen, texts, isHidden: hideable && isHidden });
      setStatus('saved');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>{t('builtinScreens.language')}</span>
          <select
            id="builtin-screen-language"
            value={language}
            onChange={(event) => setLanguage(event.target.value as LanguageCode)}
            className="h-9 max-w-xs rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {SUPPORTED_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_NATIVE_NAMES[code]}
              </option>
            ))}
          </select>
        </label>
        {isTermsScreen ? (
          <p className="text-start text-sm text-muted-foreground" data-testid="terms-title-note">
            {t('builtinScreens.termsTitleNote')}
          </p>
        ) : null}
        {DETAIL_SCREEN_PARENTS[screen] === undefined ? null : (
          <p className="text-start text-sm text-muted-foreground">
            {t('builtinScreens.detailNote')}
          </p>
        )}
        {fields.map((field) =>
          field === 'help' ? (
            <label key={field} className="flex flex-col gap-1.5 text-sm font-medium">
              <span>{t(`builtinScreens.field.${field}`)}</span>
              <Textarea
                id={`builtin-screen-${field}`}
                rows={3}
                dir={direction}
                lang={language}
                value={texts[field]?.[language] ?? ''}
                onChange={(event) => edit(field, event.target.value)}
              />
            </label>
          ) : (
            <AdminAuthField
              key={field}
              id={`builtin-screen-${field}`}
              label={t(`builtinScreens.field.${field}`)}
              dir={direction}
              lang={language}
              placeholder={bundled(field) ?? ''}
              value={texts[field]?.[language] ?? ''}
              onChange={(event) => edit(field, event.target.value)}
            />
          ),
        )}
        {isQuestionScreen(screen) ? (
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                id="builtin-screen-hidden"
                type="checkbox"
                checked={hideable && isHidden}
                disabled={!hideable}
                onChange={(event) => {
                  setIsHidden(event.target.checked);
                  setStatus('idle');
                }}
              />
              {t('builtinScreens.hideLabel')}
            </label>
            {hideable ? null : (
              <p className="text-start text-xs text-muted-foreground" data-testid="hide-locked">
                {t('builtinScreens.hideLocked')}
              </p>
            )}
          </div>
        ) : null}
        {status === 'failed' ? (
          <p role="alert" className="text-start text-sm text-destructive">
            {t('builtinScreens.failed')}
          </p>
        ) : null}
        {status === 'saved' ? (
          <p aria-live="polite" className="text-start text-sm text-muted-foreground">
            {t('builtinScreens.saved')}
          </p>
        ) : null}
        <Button
          type="button"
          className="w-fit"
          disabled={status === 'saving'}
          onClick={() => void save()}
          data-testid="builtin-screen-save"
        >
          {t('builtinScreens.save')}
        </Button>
      </div>

      <aside
        className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-5"
        aria-label={t('builtinScreens.previewTitle')}
      >
        <h4 className="text-start text-sm font-semibold">{t('builtinScreens.previewTitle')}</h4>
        {usesBundled ? (
          <p className="text-start text-xs text-muted-foreground" data-testid="screen-fallback">
            {t('builtinScreens.previewFallback')}
          </p>
        ) : null}
        <div
          lang={language}
          dir={direction}
          className="flex flex-col gap-3 rounded-lg border bg-background p-4"
          data-testid="builtin-screen-preview"
        >
          <p className="text-start text-lg font-semibold" data-testid="preview-title">
            {title}
          </p>
          {intro === undefined || intro === '' ? null : (
            <p className="text-start text-sm text-muted-foreground">{intro}</p>
          )}
          {staff('help') === '' ? null : (
            <p className="text-start text-sm" data-testid="preview-help">
              {staff('help')}
            </p>
          )}
          <span
            className="rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground"
            data-testid="preview-continue"
          >
            {shown('continue_label')}
          </span>
          {fields.includes('decline_label') ? (
            <span className="text-center text-sm" data-testid="preview-decline">
              {shown('decline_label')}
            </span>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
