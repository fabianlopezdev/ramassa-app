/**
 * Editing your own profile (RAPP-22).
 *
 * Built from the SAME controls as the intake wizard (the text field, the option
 * chip, the country picker) and validated by a schema composed from the same
 * intake fields, so a woman meets the same question in the same shape whether
 * she is answering it for the first time or correcting it a year later.
 *
 * The save is optimistic about the CACHE and honest about the OUTCOME. The
 * cache is painted immediately, so the profile she returns to is already
 * correct; the screen itself waits for the server, with the Save button in its
 * busy state, because leaving is the only success signal this flow has. A save
 * that popped the screen the moment it was dispatched was indistinguishable
 * from one that worked, and the failure that actually hurts is believing a new
 * phone number is saved when the team cannot reach her.
 *
 * A failed save therefore keeps her here, with her edits (see
 * `profileFormResetOptions`: the rollback rewrites the cache this form reads
 * from, and without that option it would silently reset every field), a
 * translated message and a code.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { ErrorCodeLine, FailureNotice } from '@/components/error-code-line';
import { ShakeOnError } from '@/components/motion/shake-on-error';
import { SkeletonPulse } from '@/components/motion/skeleton-pulse';
import { CountryPicker } from '@/components/onboarding/country-picker';
import { OptionChip } from '@/components/onboarding/option-chip';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { playHaptic } from '@/lib/haptics/haptics';
import { profileFormResetOptions, profileSaveCallbacks } from '@/lib/profile-save';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { z } from 'zod';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { useOwnProfile, useUpdateOwnProfile } from '@ramassa/shared/profile';
import {
  CLOTHING_SIZES,
  DOCUMENT_TYPES,
  profileEditSchema,
  profileFromRow,
  SHOE_SIZES,
  type ProfileEdit,
} from '@ramassa/shared/schemas';

type ProfileEditInput = z.input<typeof profileEditSchema>;

/**
 * How many label+field pairs the loading placeholder draws. A skeleton, not a
 * spinner (SPEC / contract rule 14): it keeps the layout stable and says what
 * is coming, where a spinner only says "wait" and lets the form jump in
 * underneath it.
 */
const LOADING_FIELD_COUNT = 5;

/**
 * The document type's translation key, mapped explicitly and hoisted.
 *
 * Not built from the stored value (`documentType${type.charAt(0)...}`) for the
 * reason the profile read view already gives for its own mapping: a value that
 * ever stopped matching a key would put the raw key on screen instead of
 * failing loudly. Hoisting it also stops four string builds per render of a
 * form that re-renders whenever a watched field changes.
 */
const DOCUMENT_TYPE_LABEL_KEYS = {
  nie: 'onboarding:documentTypeNie',
  passport: 'onboarding:documentTypePassport',
  other: 'onboarding:documentTypeOther',
  none: 'onboarding:documentTypeNone',
} as const;

/**
 * Everything that is not a digit, stripped from the dependants count so a
 * pasted "2 fills" or an Arabic-Indic keyboard's stray character cannot reach
 * `Number()`.
 *
 * Hoisted, and this one the React Compiler cannot do for us: a regex LITERAL
 * builds a fresh RegExp every time the expression is evaluated, and this one is
 * evaluated per KEYSTROKE inside an event handler rather than per render. The
 * compiler memoizes renders, not calls. Safe as a shared instance because
 * `String.prototype.replace` with a global regex resets `lastIndex` itself;
 * `.test()` is the one that would carry state between calls.
 */
const NON_DIGITS = /\D/g;

export default function ProfileEditScreen() {
  const { t } = useTranslation(['profile', 'onboarding']);
  const languageFontClass = useLanguageFontClass();
  const router = useRouter();
  const { data: profile, isLoading, isFetching, isError, error, refetch } = useOwnProfile();
  const update = useUpdateOwnProfile();

  const defaultValues = useMemo(
    () => (profile === null || profile === undefined ? undefined : profileFromRow(profile)),
    [profile],
  );

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
    // Three generics, not one: the schema's INPUT (what the fields hold, with
    // optional keys absent) is not its OUTPUT (what the RPC receives), and
    // collapsing them makes the resolver unassignable.
  } = useForm<ProfileEditInput, unknown, ProfileEdit>({
    resolver: zodResolver(profileEditSchema),
    // Keyed on the loaded row: the form mounts before the profile arrives, and
    // without this it would keep its empty defaults and offer to overwrite a
    // real profile with blanks.
    values: defaultValues as ProfileEditInput | undefined,
    // Her in-progress edits survive the cache changing underneath the form,
    // which is what the optimistic save's ROLLBACK does. See the constant.
    resetOptions: profileFormResetOptions,
  });

  const documentType = watch('documentType');
  const hasDependents = watch('hasDependents');
  const [isBlocked, setIsBlocked] = useState(false);
  // The failure's own code, not a boolean, exactly as the erasure screen and
  // the wizard's terms step hold theirs: it drives the shake, picks the haptic
  // through the RAPP-12 taxonomy, and is the code she can read out.
  const [failureCode, setFailureCode] = useState<AppErrorCode | null>(null);

  const save = handleSubmit(
    (edit) => {
      setIsBlocked(false);
      setFailureCode(null);
      update.mutate(
        edit,
        profileSaveCallbacks({
          // The completed primary action, confirmed when the SERVER says so
          // rather than when the button was pressed: an optimistic buzz on a
          // write that then rolls back is exactly the lie this screen avoids.
          // Leaving is part of the same signal, which is why it is here and not
          // on a callback that also runs when the write failed.
          onSaved: () => {
            playHaptic('success');
            router.back();
          },
          // Stay. The cache has rolled back to what is actually stored, and the
          // message below says so; the shake's haptic comes from the code, so a
          // dead connection feels different from a rejected field.
          onFailed: (error) => setFailureCode(toAppError(error).code),
        }),
      );
    },
    // A rejected submit has to SAY something at the button. Every field error
    // renders next to its own field, which on a form this long is usually far
    // above the fold: pressing Save and watching nothing happen is how a
    // working button reads as a broken app. Profiles created before place of
    // birth became required hit this on their very first edit.
    () => {
      setIsBlocked(true);
      // The same warning buzz every rejected form submit in the app fires, from
      // the shared vocabulary. Fired on every press, so a second Save that is
      // still invalid still answers.
      playHaptic('warning');
    },
  );

  if (isLoading) {
    return (
      // Announced as LOADING and busy, not as the screen's title: over a
      // skeleton, "Edit my information" reads as a form that is ready and
      // simply has nothing in it.
      //
      // The SAME safe-area frame the loaded state gets, because the loaded
      // state is a WizardFrame and this screen's stack draws no header
      // (`headerShown: false` for the whole (app) stack). Without it the
      // placeholder starts under the status bar and then the real form drops
      // by the inset the moment it arrives, which is precisely the jump a
      // skeleton exists to prevent.
      <SafeAreaView
        accessible
        accessibilityLabel={t('loading')}
        accessibilityState={{ busy: true }}
        accessibilityLiveRegion="polite"
        edges={['top', 'bottom']}
        className="flex-1 gap-md bg-white p-lg"
      >
        {Array.from({ length: LOADING_FIELD_COUNT }, (_unused, index) => (
          <View key={index} className="gap-xs">
            <SkeletonPulse className="h-md w-1/3 rounded-md" />
            <SkeletonPulse className="min-h-recommended w-full rounded-md" />
          </View>
        ))}
      </SafeAreaView>
    );
  }

  if (defaultValues === undefined) {
    // The read finished and there is nothing to edit: it failed, or it came
    // back with no row. Either way the form cannot be shown, and the skeleton
    // above must NOT be what she is left looking at — a placeholder that never
    // resolves says "almost there" forever, and this screen's own busy state
    // would go on announcing it.
    //
    // The same three parts the profile tab's failed read uses, in the frame
    // this screen already has: the message, the code staff can act on
    // (contract rule 7), and a retry as the primary action.
    const loadFailureCode = isError ? toAppError(error).code : 'DB-2';
    return (
      <WizardFrame
        title={t('editTitle')}
        continueLabel={t('retryAction')}
        onContinue={() => void refetch()}
        isContinueBusy={isFetching}
        onBack={() => router.back()}
      >
        <ShakeOnError errorCode={loadFailureCode}>
          <View className="gap-xs">
            <Text
              accessibilityLiveRegion="polite"
              className={`text-start text-md text-error ${languageFontClass}`}
            >
              {t('loadFailed')}
            </Text>
            <ErrorCodeLine code={loadFailureCode} />
          </View>
        </ShakeOnError>
      </WizardFrame>
    );
  }

  return (
    <WizardFrame
      title={t('editTitle')}
      continueLabel={t('saveAction')}
      onContinue={() => void save()}
      isContinueBusy={update.isPending}
      onBack={() => router.back()}
    >
      <Controller
        control={control}
        name="firstName"
        render={({ field }) => (
          <AuthTextField
            // Same convention as the wizard's fields: the label is rendered
            // twice on this control, as the visible caption and as the input's
            // accessibility label, so matching by text is ambiguous and can
            // resolve to the caption, which nothing can type into. The suite
            // edits this field because it is the first one on both this screen
            // and the profile screen, so proving an edit survives needs no
            // scrolling on either.
            testID="profile-edit-first-name"
            label={t('onboarding:firstNameLabel')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            errorMessage={errors.firstName ? t('onboarding:errorRequired') : undefined}
            autoCapitalize="words"
          />
        )}
      />
      <Controller
        control={control}
        name="lastName"
        render={({ field }) => (
          <AuthTextField
            label={t('onboarding:lastNameLabel')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            errorMessage={errors.lastName ? t('onboarding:errorRequired') : undefined}
            autoCapitalize="words"
          />
        )}
      />
      <Controller
        control={control}
        name="placeOfBirth"
        render={({ field }) => (
          <AuthTextField
            // The field the smoke suite edits. Chosen because the seed leaves it
            // NULL for the participant the suite signs in as (deliberately: two
            // rows keep a null so the "created before this field existed" case
            // is covered), so the flow can type into it without first erasing
            // what is there - and erasing an Arabic-script value through the
            // Android driver hangs until Maestro's own two-minute deadline.
            testID="profile-edit-place-of-birth"
            label={t('onboarding:placeOfBirthLabel')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            errorMessage={errors.placeOfBirth ? t('onboarding:errorRequired') : undefined}
          />
        )}
      />
      <Controller
        control={control}
        name="nationality"
        render={({ field }) => (
          <CountryPicker
            label={t('onboarding:nationalityLabel')}
            value={field.value}
            onChange={field.onChange}
            errorMessage={errors.nationality ? t('onboarding:errorRequired') : undefined}
          />
        )}
      />

      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {t('onboarding:documentTypeLabel')}
        </Text>
        <Controller
          control={control}
          name="documentType"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-sm">
              {DOCUMENT_TYPES.map((type) => (
                <OptionChip
                  key={type}
                  label={t(DOCUMENT_TYPE_LABEL_KEYS[type])}
                  isSelected={field.value === type}
                  onPress={() => field.onChange(type)}
                />
              ))}
            </View>
          )}
        />
      </View>

      {documentType === 'none' ? null : (
        <Controller
          control={control}
          name="documentNumber"
          render={({ field }) => (
            <AuthTextField
              label={t('onboarding:documentNumberLabel')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              errorMessage={
                errors.documentNumber
                  ? documentType === 'nie'
                    ? t('onboarding:errorNieFormat')
                    : t('onboarding:errorRequired')
                  : undefined
              }
              autoCapitalize="characters"
            />
          )}
        />
      )}

      <Controller
        control={control}
        name="phone"
        render={({ field }) => (
          <AuthTextField
            // Same testID convention as the wizard's fields, and for the same
            // reason: the label is rendered TWICE on this control, once as the
            // visible caption and once as the input's accessibility label, so
            // matching a field by its text is ambiguous and can resolve to the
            // caption, which nothing can type into. The suite edits this field.
            testID="profile-edit-phone"
            label={t('onboarding:phoneLabel')}
            placeholder={t('onboarding:phonePlaceholder')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            errorMessage={errors.phone ? t('onboarding:errorPhoneFormat') : undefined}
            keyboardType="phone-pad"
          />
        )}
      />
      <Controller
        control={control}
        name="address"
        render={({ field }) => (
          <AuthTextField
            label={t('onboarding:addressLabel')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <Controller
        control={control}
        name="city"
        render={({ field }) => (
          <AuthTextField
            label={t('onboarding:cityLabel')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <Controller
        control={control}
        name="postalCode"
        render={({ field }) => (
          <AuthTextField
            label={t('onboarding:postalCodeLabel')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            errorMessage={errors.postalCode ? t('onboarding:errorPostalFormat') : undefined}
            keyboardType="number-pad"
          />
        )}
      />

      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {t('onboarding:hasDependentsLabel')}
        </Text>
        <Controller
          control={control}
          name="hasDependents"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-sm">
              <OptionChip
                label={t('onboarding:yesOption')}
                isSelected={field.value === true}
                onPress={() => field.onChange(true)}
              />
              <OptionChip
                label={t('onboarding:noOption')}
                isSelected={field.value === false}
                onPress={() => field.onChange(false)}
              />
            </View>
          )}
        />
      </View>

      {hasDependents ? (
        <Controller
          control={control}
          name="numDependents"
          render={({ field }) => (
            <AuthTextField
              label={t('onboarding:numDependentsLabel')}
              value={String(field.value ?? '')}
              onChangeText={(text) => field.onChange(Number(text.replace(NON_DIGITS, '')) || 0)}
              onBlur={field.onBlur}
              errorMessage={errors.numDependents ? t('onboarding:errorDependentsRange') : undefined}
              keyboardType="number-pad"
            />
          )}
        />
      ) : null}

      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {t('onboarding:clothingSizeLabel')}
        </Text>
        <Controller
          control={control}
          name="clothingSize"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-sm">
              {CLOTHING_SIZES.map((size) => (
                <OptionChip
                  key={size}
                  label={size}
                  isSelected={field.value === size}
                  onPress={() => field.onChange(size)}
                />
              ))}
            </View>
          )}
        />
      </View>

      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {t('onboarding:shoeSizeLabel')}
        </Text>
        <Controller
          control={control}
          name="shoeSize"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-sm">
              {SHOE_SIZES.map((size) => (
                <OptionChip
                  key={size}
                  label={size}
                  isSelected={field.value === size}
                  onPress={() => field.onChange(size)}
                />
              ))}
            </View>
          )}
        />
      </View>

      {/* The revocable consent, in both directions. The wizard told her she
          could change this from her profile; this is the control that keeps
          that promise. */}
      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
          {t('onboarding:mediaConsentLabel')}
        </Text>
        <Controller
          control={control}
          name="mediaConsent"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-sm">
              <OptionChip
                label={t('onboarding:yesOption')}
                isSelected={field.value === true}
                onPress={() => field.onChange(true)}
              />
              <OptionChip
                label={t('onboarding:noOption')}
                isSelected={field.value === false}
                onPress={() => field.onChange(false)}
              />
            </View>
          )}
        />
      </View>
      {/* Rendered LAST, so it sits directly above the Save button. Put at the
          top of a form this long it would be off-screen at the moment it
          matters, which is the same failure it exists to fix. */}
      {isBlocked ? (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${languageFontClass}`}
        >
          {t('saveBlocked')}
        </Text>
      ) : null}

      {/* The write failed and the cache rolled back. Mounted only while there IS
          a failure, so it never occupies a slot in the frame's gap.

          Driven by the callback's state rather than by `update.isError`, so the
          message cannot outlive the attempt it describes: pressing Save again
          clears it at the top of the submit. */}
      {failureCode === null ? null : <FailureNotice code={failureCode} message={t('saveFailed')} />}
    </WizardFrame>
  );
}
