/**
 * A participant's card (RAPP-247): who she is and what a coach needs at the
 * pitch. A row appears only when the database returned a value, so the card
 * shows exactly what the person's field levels allow (RAPP-240) and never a
 * row of blanks. A screen of its own on a phone; the right half of the lookup
 * on a tablet. Her material and the handover button follow (RAPP-249).
 */
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { ParticipantMaterial } from '@/components/equipment/participant-material';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useParticipantCard } from '@/lib/participant-lookup';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { toAppError } from '@ramassa/shared/errors';
import { isSupportedLanguage, LANGUAGE_NATIVE_NAMES } from '@ramassa/shared/i18n';

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

export function ParticipantCard({
  participantId,
  onBack,
}: {
  readonly participantId: string;
  readonly onBack?: () => void;
}) {
  const { t } = useTranslation('participants');
  const { t: tProfile } = useTranslation('profile');
  const { t: tOnboarding } = useTranslation('onboarding');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const languageFontClass = useLanguageFontClass();
  const { data, isPending, isError, error, refetch, isFetching } =
    useParticipantCard(participantId);
  const { push } = useRouter();
  const canHandOver = useAccountAccess().permissions.has('equipment.handover');

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

  const language = isSupportedLanguage(data.preferred_language)
    ? LANGUAGE_NATIVE_NAMES[data.preferred_language]
    : null;
  const rows: { readonly key: string; readonly label: string; readonly value: string | null }[] = [
    { key: 'language', label: tCommon('interfaceLanguageLabel'), value: language },
    { key: 'phone', label: tProfile('fieldPhone'), value: data.phone },
    { key: 'city', label: tProfile('fieldCity'), value: data.city },
    { key: 'entity', label: t('columnEntity'), value: data.reference_entity },
    { key: 'clothing', label: tOnboarding('clothingSizeLabel'), value: data.clothing_size },
    { key: 'shoe', label: tOnboarding('shoeSizeLabel'), value: data.shoe_size },
  ];

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
          {`${data.first_name} ${data.last_name}`}
        </Text>
        <Text
          className={`text-start text-sm font-semibold ${
            // Dark text: the brand green on white is far below WCAG AA.
            data.is_active ? 'text-neutral-800' : 'text-neutral-600'
          } ${languageFontClass}`}
        >
          {data.is_active ? t('rowActive') : t('rowInactive')}
        </Text>
      </View>
      <View
        style={continuousCorners}
        className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
      >
        {rows
          .filter((row) => row.value !== null && row.value.length > 0)
          .map((row) => (
            <CardRow key={row.key} label={row.label} value={row.value as string} />
          ))}
      </View>
      {canHandOver ? (
        <PressableScale
          testID="participant-hand-over"
          accessibilityRole="button"
          accessibilityLabel={t('material.handOver')}
          onPress={() => push(`/handover/${participantId}` as Href)}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
        >
          <Text className={`text-center text-md font-bold text-white ${languageFontClass}`}>
            {t('material.handOver')}
          </Text>
        </PressableScale>
      ) : null}
      <ParticipantMaterial participantId={participantId} />
    </ScrollView>
  );
}
