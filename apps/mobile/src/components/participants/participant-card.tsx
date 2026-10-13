/**
 * A participant's card (RAPP-247, the full record since RAPP-281): her whole
 * record as the web admin shows it, within the reader's field levels
 * (RAPP-240), and the actions the reader's permissions allow. A screen of its
 * own on a phone; the right half of the list on a tablet.
 *
 * A field above the reader's level does not show at all. A field she may see
 * but nobody filled in says so, because a blank row looks like a field that
 * failed to load. Her material and the handover button come from RAPP-249.
 */
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { ParticipantMaterial } from '@/components/equipment/participant-material';
import { PressableScale } from '@/components/motion/pressable-scale';
import { DOCUMENT_TYPE_LABEL_KEYS } from '@/components/profile/profile-form-fields';
import { continuousCorners } from '@/lib/continuous-corners';
import { useParticipantCard, useParticipantWrites } from '@/lib/participant-lookup';
import {
  participantFieldAccess,
  visibleProfileFields,
  type ParticipantProfileField,
} from '@/lib/participant-profile';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { toAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE, isSupportedLanguage, LANGUAGE_NATIVE_NAMES } from '@ramassa/shared/i18n';
import type { ParticipantDetailRow } from '@ramassa/shared/participants';

function CardRow({ label, value }: { readonly label: string; readonly value: string }) {
  const languageFontClass = useLanguageFontClass();
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} className="gap-xs py-xs">
      <Text className={`text-start text-sm text-neutral-500 ${languageFontClass}`}>{label}</Text>
      <Text selectable className={`text-start text-md text-neutral-900 ${languageFontClass}`}>
        {value}
      </Text>
    </View>
  );
}

function CardAction({
  testID,
  label,
  onPress,
  isPrimary = false,
  isBusy = false,
}: {
  readonly testID: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly isPrimary?: boolean;
  readonly isBusy?: boolean;
}) {
  const languageFontClass = useLanguageFontClass();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      isBusy={isBusy}
      onPress={onPress}
      haptic="tapLight"
      style={continuousCorners}
      className={`min-h-recommended items-center justify-center rounded-md px-lg ${
        isPrimary ? 'bg-primary' : 'border border-neutral-300 bg-white'
      } ${isBusy ? 'opacity-60' : ''}`}
    >
      <Text
        className={`text-center text-md font-bold ${
          isPrimary ? 'text-white' : 'text-primary-dark'
        } ${languageFontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export function ParticipantCard({
  participantId,
  onBack,
}: {
  readonly participantId: string;
  readonly onBack?: () => void;
}) {
  const { t, i18n } = useTranslation('participants');
  const { t: tProfile } = useTranslation('profile');
  const { t: tOnboarding } = useTranslation('onboarding');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const languageFontClass = useLanguageFontClass();
  const { data, isPending, isError, error, refetch, isFetching } =
    useParticipantCard(participantId);
  const { setActive, setForumPosting } = useParticipantWrites(participantId);
  const { push } = useRouter();
  const { permissions } = useAccountAccess();
  const access = participantFieldAccess(permissions);
  const canHandOver = permissions.has('equipment.handover');
  const canEdit = access.personal;
  const canChangeStatus = permissions.has('participants.deactivate');
  const canModerateForum = permissions.has('forum.moderate');
  const locale = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const formats = useMemo(
    () => ({
      // A birth date is a calendar day, so it is read in UTC and never shifts.
      day: new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      moment: new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: MADRID_TIME_ZONE,
      }),
    }),
    [locale],
  );

  if (isPending) return <AnnouncementFeedSkeleton accessibilityLabel={t('title')} />;
  if (isError) {
    return (
      <AnnouncementFeedError
        message={t('detailNotFoundTitle')}
        retryLabel={tErrors('retry')}
        code={toAppError(error).code}
        languageFontClass={languageFontClass}
        onRetry={() => void refetch()}
        isLoading={isFetching}
      />
    );
  }
  if (data === null || data === undefined) {
    return (
      <AnnouncementEmptyState
        title={t('detailNotFoundTitle')}
        body={t('emptyBody')}
        languageFontClass={languageFontClass}
      />
    );
  }

  const name = `${data.first_name} ${data.last_name}`;
  const shown = (value: string | null) =>
    value === null || value.length === 0 ? tProfile('notProvided') : value;
  const row = (
    field: ParticipantProfileField,
    participant: ParticipantDetailRow,
  ): { readonly label: string; readonly value: string } => {
    switch (field) {
      case 'dateOfBirth':
        return {
          label: tOnboarding('dateOfBirthLabel'),
          value:
            participant.date_of_birth === null
              ? tProfile('notProvided')
              : formats.day.format(new Date(`${participant.date_of_birth}T00:00:00Z`)),
        };
      case 'placeOfBirth':
        return {
          label: tOnboarding('placeOfBirthLabel'),
          value: shown(participant.place_of_birth),
        };
      case 'nationality':
        return { label: tOnboarding('nationalityLabel'), value: shown(participant.nationality) };
      case 'language':
        return {
          label: tProfile('languageLabel'),
          value: isSupportedLanguage(participant.preferred_language)
            ? LANGUAGE_NATIVE_NAMES[participant.preferred_language]
            : tProfile('notProvided'),
        };
      case 'documentType': {
        const type = participant.document_type;
        return {
          label: tOnboarding('documentTypeLabel'),
          value:
            type !== null && type in DOCUMENT_TYPE_LABEL_KEYS
              ? t(DOCUMENT_TYPE_LABEL_KEYS[type as keyof typeof DOCUMENT_TYPE_LABEL_KEYS])
              : tProfile('notProvided'),
        };
      }
      case 'documentNumber':
        return {
          label: tOnboarding('documentNumberLabel'),
          value: shown(participant.document_number),
        };
      case 'phone':
        return { label: tProfile('fieldPhone'), value: shown(participant.phone) };
      case 'address':
        return { label: tProfile('fieldAddress'), value: shown(participant.address) };
      case 'city':
        return { label: tProfile('fieldCity'), value: shown(participant.city) };
      case 'postalCode':
        return { label: tProfile('fieldPostalCode'), value: shown(participant.postal_code) };
      case 'entity':
        return { label: t('columnEntity'), value: shown(participant.reference_entity) };
      case 'referenceContact':
        return {
          label: tOnboarding('referenceContactNameLabel'),
          value: shown(participant.reference_contact_name),
        };
      case 'dependents':
        return {
          label: t('columnDependents'),
          value: participant.has_dependents
            ? String(participant.num_dependents)
            : tOnboarding('noOption'),
        };
      case 'clothingSize':
        return { label: tOnboarding('clothingSizeLabel'), value: shown(participant.clothing_size) };
      case 'shoeSize':
        return { label: tOnboarding('shoeSizeLabel'), value: shown(participant.shoe_size) };
      case 'mediaConsent':
        // The staff wording. Her own profile says "I appear in community photos".
        return {
          label: tProfile('fieldMediaConsent'),
          value: participant.media_consent ? t('mediaConsentGranted') : t('mediaConsentDenied'),
        };
      case 'terms':
        return {
          label: tOnboarding('termsTitle'),
          value:
            participant.terms_accepted_at === null
              ? tProfile('notProvided')
              : t('termsAcceptedOn', {
                  date: formats.moment.format(new Date(participant.terms_accepted_at)),
                }),
        };
    }
  };

  const changeStatus = () => {
    if (!data.is_active) {
      setActive.mutate(true);
      return;
    }
    // Leaving the active lists is easy to undo, but a slip of the thumb at the
    // pitch should not do it, so the phone asks first. The web build has no
    // native alert, so it asks through the browser.
    const title = t('profile.deactivateTitle', { name });
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${t('profile.deactivateBody')}`)) setActive.mutate(false);
      return;
    }
    Alert.alert(title, t('profile.deactivateBody'), [
      { text: tProfile('cancelAction'), style: 'cancel' },
      {
        text: t('statusActionDeactivate'),
        style: 'destructive',
        onPress: () => setActive.mutate(false),
      },
    ]);
  };

  return (
    <ScrollView contentContainerClassName="gap-md p-lg" testID="participant-card">
      {onBack === undefined ? null : (
        <PressableScale
          accessibilityLabel={tCommon('back')}
          onPress={onBack}
          haptic="tapLight"
          className="min-h-recommended self-start justify-center"
        >
          <Text className={`font-semibold text-primary-dark ${languageFontClass}`}>
            {tCommon('back')}
          </Text>
        </PressableScale>
      )}
      <View className="gap-xs">
        <Text
          accessibilityRole="header"
          className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
        >
          {name}
        </Text>
        <View className="flex-row flex-wrap gap-sm">
          <Text
            className={`text-start text-sm font-semibold ${
              // Dark text: the brand green on white is far below WCAG AA.
              data.is_active ? 'text-neutral-800' : 'text-neutral-600'
            } ${languageFontClass}`}
          >
            {data.is_active ? t('rowActive') : t('rowInactive')}
          </Text>
          {data.is_forum_banned ? (
            <Text className={`text-start text-sm font-semibold text-error ${languageFontClass}`}>
              {t('forumBanned')}
            </Text>
          ) : null}
        </View>
        <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
          {t('detailJoinedOn', { date: formats.moment.format(new Date(data.created_at)) })}
        </Text>
      </View>

      {canHandOver ? (
        <CardAction
          testID="participant-hand-over"
          label={t('material.handOver')}
          onPress={() => push(`/handover/${participantId}` as Href)}
          isPrimary
        />
      ) : null}
      {canEdit || canChangeStatus || canModerateForum ? (
        <View className="flex-row flex-wrap gap-sm">
          {canEdit ? (
            <CardAction
              testID="participant-edit"
              label={t('editAction')}
              onPress={() => push(`/participant-edit/${participantId}` as Href)}
            />
          ) : null}
          {canChangeStatus ? (
            <CardAction
              testID="participant-status"
              label={data.is_active ? t('statusActionDeactivate') : t('statusActionActivate')}
              onPress={changeStatus}
              isBusy={setActive.isPending}
            />
          ) : null}
          {canModerateForum ? (
            <CardAction
              testID="participant-forum"
              label={
                data.is_forum_banned
                  ? t('forumPostingEnableAction')
                  : t('forumPostingDisableAction')
              }
              onPress={() => setForumPosting.mutate(!data.is_forum_banned)}
              isBusy={setForumPosting.isPending}
            />
          ) : null}
        </View>
      ) : null}
      {setActive.isError ? (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${languageFontClass}`}
        >
          {t('statusChangeFailed')}
        </Text>
      ) : null}
      {setForumPosting.isError ? (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${languageFontClass}`}
        >
          {t('forumPostingStatusChangeFailed')}
        </Text>
      ) : null}

      <View className="gap-xs">
        <Text
          accessibilityRole="header"
          className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}
        >
          {t('sectionProfile')}
        </Text>
        {/* Said out loud: opening this card wrote an audit row with her name. */}
        <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
          {t('accessLogged')}
        </Text>
      </View>
      <View
        testID="participant-profile"
        style={continuousCorners}
        className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
      >
        {visibleProfileFields(access).map((field) => {
          const { label, value } = row(field, data);
          return <CardRow key={field} label={label} value={value} />;
        })}
      </View>
      <ParticipantMaterial participantId={participantId} />
    </ScrollView>
  );
}
