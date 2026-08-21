import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { usePlayerSurveys } from '@/lib/player-surveys';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useLanguage } from '@ramassa/shared/i18n';
import { resolveSurveyCopy } from '@ramassa/shared/surveys';

export function SurveyPrompt({ eventId }: { readonly eventId?: string }) {
  const { t } = useTranslation('surveys');
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { data } = usePlayerSurveys();
  const survey = useMemo(
    () =>
      data?.find(
        (item) =>
          item.responseStatus !== 'completed' &&
          (eventId === undefined ? true : item.eventId === eventId),
      ),
    [data, eventId],
  );
  if (survey === undefined) return null;
  const title = resolveSurveyCopy(survey.title, language);
  return (
    <View
      className="gap-md rounded-lg border border-primary/20 bg-primary/5 p-lg"
      style={continuousCorners}
      accessibilityLabel={`${t('promptEyebrow')}. ${title}`}
    >
      <Text className={`text-start text-sm font-bold uppercase text-primary ${languageFontClass}`}>
        {t('promptEyebrow')}
      </Text>
      <Text className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}>
        {title}
      </Text>
      <PressableScale
        accessibilityLabel={`${t('promptAction')}: ${title}`}
        onPress={() => push(`/survey/${survey.id}` as Href)}
        haptic="tapLight"
        className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
      >
        <Text className={`text-md font-bold text-white ${languageFontClass}`}>
          {t('promptAction')}
        </Text>
      </PressableScale>
    </View>
  );
}
