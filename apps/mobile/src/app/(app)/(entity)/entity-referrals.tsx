/**
 * The partner entity's Referrals tab on the phone (RAPP-413), as the web
 * portal's referrals page: the women her entity referred with their status,
 * newest first, a search over names, phone, email and entity that ignores
 * case and accents, New referral, and a tap that opens one referral.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useEntityReferrals } from '@/lib/entity-referrals';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { filterReferrals } from '@ramassa/shared/referrals';

export default function EntityReferralsScreen() {
  const { t, i18n } = useTranslation('referrals');
  const fontClass = useLanguageFontClass();
  const { push } = useRouter();
  const referrals = useEntityReferrals();
  const [query, setQuery] = useState('');
  const dates = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        dateStyle: 'medium',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );
  const all = referrals.data ?? [];
  const rows = filterReferrals(all, query);

  return (
    <SafeAreaView
      testID="entity-referrals"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-3xl"
        keyboardShouldPersistTaps="handled"
      >
        <PageWidth className="gap-lg p-lg">
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('title')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>{t('intro')}</Text>
          </View>
          <PressableScale
            testID="entity-referral-new"
            accessibilityRole="button"
            accessibilityLabel={t('newAction')}
            onPress={() => push('/entity-referral-new' as Href)}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center self-start rounded-md bg-primary px-lg"
          >
            <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
              {t('newAction')}
            </Text>
          </PressableScale>

          {referrals.data !== undefined && all.length === 0 ? (
            <View className="gap-xs">
              <Text className={`text-start text-lg font-semibold text-neutral-900 ${fontClass}`}>
                {t('emptyTitle')}
              </Text>
              <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                {t('emptyBody')}
              </Text>
            </View>
          ) : (
            <>
              <AuthTextField
                testID="entity-referral-search"
                label={t('searchLabel')}
                placeholder={t('searchPlaceholder')}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                maxLength={120}
              />
              {rows.length === 0 && referrals.data !== undefined ? (
                <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                  {t('searchEmpty')}
                </Text>
              ) : (
                <View className="gap-sm">
                  {rows.map((referral) => {
                    const name =
                      `${referral.referredFirstName} ${referral.referredLastName}`.trim();
                    return (
                      <PressableScale
                        key={referral.id}
                        testID={`entity-referral-${referral.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`${t('open')}: ${name}`}
                        onPress={() => push(`/entity-referral/${referral.id}` as Href)}
                        haptic="selection"
                        style={continuousCorners}
                        className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
                      >
                        <View className="flex-row flex-wrap items-center justify-between gap-sm">
                          <Text
                            className={`flex-1 text-start text-md font-bold text-neutral-900 ${fontClass}`}
                          >
                            {name}
                          </Text>
                          <Text className={`text-sm font-semibold text-neutral-700 ${fontClass}`}>
                            {t(`status.${referral.status}`)}
                          </Text>
                        </View>
                        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                          {`${t('createdLabel')}: ${dates.format(new Date(referral.createdAt))}`}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
