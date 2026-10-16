/**
 * Today's mentoring section (RAPP-382): how many requests wait to be
 * scheduled, one tap to the requests.
 */
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useStaffMentoringRequests } from '@/lib/team-mentoring';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

export function TodayMentoringCard() {
  const { t } = useTranslation('mentoring');
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const waiting =
    useStaffMentoringRequests().data?.filter((request) => request.status === 'requested').length ??
    0;
  const detail = waiting > 0 ? `${t('statusRequested')}: ${waiting}` : t('adminEmpty');
  return (
    <PressableScale
      testID="today-mentoring"
      accessibilityRole="button"
      accessibilityLabel={`${t('adminTitle')}, ${detail}`}
      onPress={() => push('/team-mentoring' as Href)}
      haptic="selection"
      style={continuousCorners}
      className="min-h-recommended justify-center gap-xs rounded-md border border-neutral-200 bg-white px-md py-sm"
    >
      <Text className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}>
        {t('adminTitle')}
      </Text>
      <Text
        className={`text-start text-md ${
          waiting > 0 ? 'font-semibold text-primary-dark' : 'text-neutral-600'
        } ${languageFontClass}`}
      >
        {detail}
      </Text>
    </PressableScale>
  );
}
