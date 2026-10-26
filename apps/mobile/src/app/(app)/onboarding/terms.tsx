/**
 * Onboarding terms and consent (RAPP-21). The full terms text is
 * readable in the player's language BEFORE anything is tapped; acceptance is
 * an explicit chip, never pre-ticked (RGPD: silence is not consent), and the
 * media consent is visibly separate and optional. Finishing calls the atomic
 * RPC, clears the on-device draft, and refreshes the auth profile so the gate
 * flips into the app.
 *
 * Declining ("Ara no") asks first, then saves the draft and signs out only
 * after confirmation. The protected device draft is kept, so signing back in
 * here resumes at terms rather than starting over.
 */

import { ConsentRow } from '@/components/authorization/consent-row';
import { SignatureSection } from '@/components/authorization/signature-section';
import { FailureNotice } from '@/components/error-code-line';
import { PressableScale } from '@/components/motion/pressable-scale';
import { TermsBody } from '@/components/onboarding/terms-body';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { appTermsWording } from '@/lib/app-terms-wording';
import { logout } from '@/lib/auth';
import { confirmAction } from '@/lib/confirm-action';
import { playHaptic } from '@/lib/haptics/haptics';
import { completeOnboarding, onboardingDraftStore } from '@/lib/onboarding';
import {
  documentationFormSchemaFor,
  identityFormSchemaFor,
  logisticsFormSchemaFor,
} from '@/lib/onboarding-form';
import { appAnswersToSave, customAnswersToSave, wizardStepRoute } from '@/lib/onboarding-intake';
import { useWizardIntake, useWizardStep } from '@/lib/onboarding-intake-context';
import { useScreenWording } from '@/lib/screen-wording';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { firstIncompleteStep } from '@/lib/wizard-completeness';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { signatureStrokesSchema, type SignatureStrokes } from '@ramassa/shared/equipment';
import type { AppErrorCode } from '@ramassa/shared/errors';
import { useLanguage } from '@ramassa/shared/i18n';
import { DEFAULT_REQUIRED_QUESTIONS, DEFAULT_WIZARD_FLOW } from '@ramassa/shared/intake';
import {
  appAnswersFromForm,
  appFormField,
  appFormToSend,
  formSignaturesPayload,
} from '@ramassa/shared/intake-builder';
import type { OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';
import { seasonAnswerFields, termsSigningSchema, termsStepSchema } from '@ramassa/shared/schemas';
import type { LanguageCode } from '@ramassa/shared/schemas';

export default function TermsStepScreen() {
  const { t, i18n } = useTranslation('onboarding');
  const languageFontClass = useLanguageFontClass();
  const { language } = useLanguage();
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const intake = useWizardIntake();
  const step = useWizardStep('terms');
  // The current version staff published (RAPP-613), or the bundled text.
  const wording = appTermsWording(
    intake.catalog.terms,
    (i18n.resolvedLanguage as LanguageCode | undefined) ?? 'ca',
    (key) => t(key),
  );
  const [draft] = useState(() => onboardingDraftStore.loadDraft());
  // Staff wording of this screen's decline button (RAPP-612), or the app's own.
  const declineLabel = useScreenWording('terms').text('decline_label', t('termsDeclineAction'));

  const signatureOwner = draft?.terms?.signatureOwnerId;
  const sameSigner = user !== null && signatureOwner === user.id;
  const savedTerms = ((signatureOwner !== undefined && !sameSigner ? {} : draft?.terms) ?? {}) as {
    termsAccepted?: boolean;
    mediaConsent?: boolean;
  };
  const [isAccepted, setIsAccepted] = useState(savedTerms.termsAccepted === true);
  const [hasMediaConsent, setHasMediaConsent] = useState(savedTerms.mediaConsent === true);
  const [strokes, setStrokes] = useState<SignatureStrokes | null>(() => {
    const parsed = signatureStrokesSchema.safeParse(sameSigner ? draft?.terms?.strokes : null);
    return parsed.success ? parsed.data : null;
  });
  const [unableToDraw, setUnableToDraw] = useState(
    sameSigner && draft?.terms?.unableToDraw === true,
  );
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignatureError, setHasSignatureError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAcceptError, setHasAcceptError] = useState(false);
  // The FAILURE's own code, not a boolean: it drives the shake and, through the
  // RAPP-12 taxonomy, decides whether the buzz is a warning or an error.
  const [failureCode, setFailureCode] = useState<AppErrorCode | null>(null);

  function persist(currentStep: OnboardingDraftStep, changes: Record<string, unknown> = {}) {
    onboardingDraftStore.saveDraft({
      ...onboardingDraftStore.loadDraft(),
      currentStep,
      terms: {
        termsAccepted: isAccepted,
        mediaConsent: hasMediaConsent,
        strokes,
        unableToDraw,
        signatureOwnerId: user?.id,
        ...changes,
      },
    });
  }

  async function finish() {
    if (!isAccepted) {
      setHasAcceptError(true);
      // The same warning buzz every rejected wizard submit fires, from the
      // shared vocabulary. Called on every press, not only the first: a player
      // who taps Finish three times must feel the refusal three times.
      playHaptic('warning');
      return;
    }
    setHasAcceptError(false);
    const signing = termsSigningSchema.safeParse({
      termsAccepted: isAccepted,
      mediaConsent: hasMediaConsent,
      strokes: unableToDraw ? null : strokes,
      unableToDraw,
    });
    if (!signing.success) {
      setHasSignatureError(true);
      playHaptic('warning');
      return;
    }
    setHasSignatureError(false);
    setFailureCode(null);
    setIsSubmitting(true);
    try {
      // Every stored step re-parses through the SAME schemas the screens used,
      // so nothing unvalidated can reach the payload even from a tampered or
      // stale draft. A failed parse sends the player back to that step with
      // their data still in the draft, not into a dead end.
      // A required answer missing anywhere (RAPP-611, RAPP-612) sends her to
      // that screen, before anything is sent.
      const incomplete = firstIncompleteStep(draft, {
        custom: intake.customPlan,
        flow: intake.flow ?? DEFAULT_WIZARD_FLOW,
        required: intake.required,
        customScreens: intake.customScreens,
        storedCustom: intake.customAnswers,
        blocks: intake.catalog.blocks,
      });
      if (incomplete !== null) {
        router.replace(wizardStepRoute(incomplete, 'back'));
        return;
      }
      const required = intake.required ?? DEFAULT_REQUIRED_QUESTIONS;
      const identity = identityFormSchemaFor(required).safeParse(draft?.identity ?? {});
      if (!identity.success) {
        router.replace(wizardStepRoute('identity', 'back'));
        return;
      }
      const documentation = documentationFormSchemaFor(required).safeParse(
        draft?.documentation ?? {},
      );
      if (!documentation.success) {
        router.replace(wizardStepRoute('documentation', 'back'));
        return;
      }
      const logistics = logisticsFormSchemaFor(required).safeParse(draft?.logistics ?? {});
      if (!logistics.success) {
        const field = logistics.error.issues[0]?.path[0];
        router.replace(
          wizardStepRoute(
            field === 'clothingSize' || field === 'shoeSize' ? 'equipment' : 'logistics',
            'back',
          ),
        );
        return;
      }
      // The registration questions (RAPP-306), all optional: a draft that does
      // not parse goes back to that screen, as the others do.
      const season = seasonAnswerFields.safeParse(draft?.season ?? {});
      if (!season.success) {
        router.replace(wizardStepRoute('season', 'back'));
        return;
      }
      const terms = termsStepSchema.parse({
        termsAccepted: true,
        mediaConsent: hasMediaConsent,
      });

      // Her answers to the app's fields, by field (RAPP-663): the checked
      // forms with the rules every screen shares, then only what is new or
      // changed (RAPP-300). The server keeps every stored answer the payload
      // leaves out, so a staff answer she only confirmed on the summary keeps
      // its source.
      const sent = appFormToSend({
        ...identity.data,
        ...documentation.data,
        ...logistics.data,
        ...season.data,
      });
      const entity = appFormField(intake.fields, 'referenceEntity');
      const appAnswers = appAnswersToSave(
        appAnswersFromForm(intake.fields, sent),
        intake.customAnswers,
        // "None" to the entity question is an answer with no value.
        sent.referenceEntity === null && entity !== undefined ? new Set([entity.id]) : new Set(),
      );

      // Her answers to the staff questions (RAPP-307), only the new or changed
      // ones. They travel with her profile in the one signed call (RAPP-611),
      // so a woman who started on her own keeps them too, and the required
      // ones are checked there before anything is kept.
      const placed = intake.customScreens.flatMap((screen) => screen.questions);
      const customAnswers = customAnswersToSave(placed, draft?.custom, intake.customAnswers);
      // An app field the generic renderer asks (RAPP-665) is saved from there only.
      for (const question of placed) delete appAnswers[question.id];

      const result = await completeOnboarding(
        {
          first_name: identity.data.firstName,
          last_name: identity.data.lastName,
          preferred_language: identity.data.preferredLanguage,
          media_consent: terms.mediaConsent,
          // The version and the language she was shown (RAPP-613): a newer
          // version published while she read this one asks her again.
          terms_version: wording.termsVersion,
          locale_shown: wording.localeShown,
          answers: { ...appAnswers, ...customAnswers },
          // Her signature of each block of her Onboarding (RAPP-690), with the
          // language its text was shown in.
          signatures: formSignaturesPayload(
            (intake.catalog.blocks ?? []).filter((block) => block.surface === 'onboarding'),
            draft?.signatures,
            language,
          ),
        },
        signing.data,
      );
      if (!result.ok) {
        // The shake and its buzz come from the code, so a system failure feels
        // different from the "you have not ticked the box" refusal above.
        setFailureCode(result.error.code);
        return;
      }
      // The completed primary action of the whole flow (RAPP-70). No animation
      // to pair it with: the auth gate swaps this stack for the tabs the moment
      // the profile refreshes, so the haptic is the confirmation that survives.
      playHaptic('success');
      if (user !== null) onboardingDraftStore.clearUserDraft(user.id);
      // Flips `needsOnboarding`; the (app) layout's guard then swaps this
      // stack out for the tabs. No manual navigation.
      await refreshProfile();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <WizardFrame
      screenId={'terms'}
      scrollEnabled={!isDrawing}
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={wording.title}
      intro={wording.mediaHint}
      continueLabel={t('finishAction')}
      onContinue={() => void finish()}
      isContinueBusy={isSubmitting}
      onBack={() => {
        persist(step.previousDraftStep ?? 'summary');
        step.goBack?.();
      }}
    >
      <TermsBody body={wording.body} />

      <ConsentRow
        testID="terms-acceptance"
        required
        requiredMark={t('authorizationRequiredMark')}
        label={wording.acceptLabel}
        checked={isAccepted}
        onToggle={() => {
          setIsAccepted((current) => !current);
          // Both, as before the errors were split: a message about the last
          // attempt is stale the moment she changes her answer.
          setHasAcceptError(false);
          setFailureCode(null);
        }}
      />
      {/* Its own message, not the form-wide "this is missing": next to a
          consent chip that reads as a statement about a field she cannot see,
          and it is the one refusal in the wizard that has to name the exact
          tap that unblocks it. */}
      {hasAcceptError ? (
        <Text
          selectable
          accessibilityLiveRegion="polite"
          className={`text-start text-form text-error ${languageFontClass}`}
        >
          {t('errorTermsRequired')}
        </Text>
      ) : null}

      <ConsentRow
        testID="terms-media-consent"
        required={false}
        requiredMark=""
        label={wording.mediaLabel}
        checked={hasMediaConsent}
        onToggle={() => setHasMediaConsent((current) => !current)}
      />

      <SignatureSection
        strokes={strokes}
        onChange={(value) => {
          setStrokes(value);
          setHasSignatureError(false);
          persist('terms', { strokes: value });
        }}
        unableToDraw={unableToDraw}
        onUnableToDrawChange={(value) => {
          setUnableToDraw(value);
          setHasSignatureError(false);
          persist('terms', { unableToDraw: value });
        }}
        onDrawingChange={setIsDrawing}
        hasError={hasSignatureError}
        testID="terms-cannot-draw"
      />

      {/* Mounted only while there IS a failure, so it never occupies a slot in
          the parent's gap. The code it carries (contract rule 7) matters more
          here than anywhere: this is the last screen of the intake, so a woman
          stuck on it has no account yet and the code is the only thing staff
          can act on. */}
      {failureCode === null ? null : (
        <FailureNotice code={failureCode} message={t('completionFailed')} />
      )}

      <PressableScale
        accessibilityLabel={declineLabel}
        isDisabled={isSubmitting}
        onPress={() =>
          confirmAction({
            title: t('termsLeaveTitle'),
            message: t('termsLeaveBody'),
            cancelLabel: t('termsLeaveStayAction'),
            confirmLabel: t('termsLeaveConfirmAction'),
            onConfirm: () => {
              persist('terms');
              void logout();
            },
          })
        }
        haptic="selection"
        className="min-h-min items-center justify-center py-sm"
      >
        <Text className={`text-form font-medium text-neutral-700 ${languageFontClass}`}>
          {declineLabel}
        </Text>
      </PressableScale>
    </WizardFrame>
  );
}
