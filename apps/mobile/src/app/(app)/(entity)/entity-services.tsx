/**
 * The partner entity's Services tab on the phone (RAPP-414), as the web
 * portal's services page: the team's latest decisions on her submissions,
 * then every submission with its status, category and any reason for a
 * rejection. Each one opens, and the actions its status allows (resubmit,
 * delete) are on its card. New service starts a submission.
 */
import { EntityServiceStatus } from '@/components/entity/entity-service-status';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { confirmDelete } from '@/lib/confirm-delete';
import { continuousCorners } from '@/lib/continuous-corners';
import {
  useEntityServiceActions,
  useEntityServiceCategories,
  useEntityServices,
} from '@/lib/entity-services';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getErrorMessageKey, toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '@ramassa/shared/i18n';
import { getEntityServiceActions } from '@ramassa/shared/services/entity';

function CardButton({
  testID,
  label,
  onPress,
  tone,
  isBusy = false,
}: {
  readonly testID: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly tone: 'primary' | 'quiet' | 'danger';
  readonly isBusy?: boolean;
}) {
  const fontClass = useLanguageFontClass();
  const box =
    tone === 'primary'
      ? 'bg-primary'
      : tone === 'danger'
        ? 'border border-error bg-white'
        : 'border border-neutral-300 bg-white';
  const text =
    tone === 'primary' ? 'text-white' : tone === 'danger' ? 'text-error' : 'text-neutral-900';
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      isBusy={isBusy}
      isDisabled={isBusy}
      haptic="tapLight"
      style={continuousCorners}
      className={`min-h-recommended items-center justify-center rounded-md px-md ${box}`}
    >
      <Text className={`text-center text-md font-semibold ${text} ${fontClass}`}>{label}</Text>
    </PressableScale>
  );
}

export default function EntityServicesScreen() {
  const { t, i18n } = useTranslation('entity-services');
  const { t: tErrors } = useTranslation('errors');
  const { t: tProfile } = useTranslation('profile');
  const fontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { services, decisions } = useEntityServices();
  const categories = useEntityServiceCategories();
  const { remove, resubmit } = useEntityServiceActions();
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const language = (i18n.resolvedLanguage ?? DEFAULT_LANGUAGE) as SupportedLanguage;
  const dates = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: MADRID_TIME_ZONE,
      }),
    [language],
  );
  const rows = services.data ?? [];
  const notifications = decisions.data ?? [];
  const open = (serviceId: string) => push(`/entity-service/${serviceId}` as Href);
  const onFailure = (error: unknown) => {
    playHaptic('error');
    setErrorCode(toAppError(error).code);
  };

  return (
    <SafeAreaView
      testID="entity-services"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
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
          <View className="self-start">
            <CardButton
              testID="entity-service-new"
              label={t('newAction')}
              tone="primary"
              onPress={() => push('/entity-service-new' as Href)}
            />
          </View>

          {errorCode === null ? null : (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              className={`text-start text-md text-error ${fontClass}`}
            >
              {tErrors(getErrorMessageKey(errorCode))}
            </Text>
          )}

          {notifications.length === 0 ? null : (
            <View
              testID="entity-service-decisions"
              style={continuousCorners}
              className="gap-md rounded-md border border-neutral-200 bg-white p-md"
            >
              <Text
                accessibilityRole="header"
                className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}
              >
                {t('decisionTitle')}
              </Text>
              {notifications.map((notification) => (
                <PressableScale
                  key={notification.id}
                  testID={`entity-service-decision-${notification.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('decisionOpen')}: ${
                    notification.serviceTitle[language] ?? notification.serviceTitle.ca
                  }`}
                  onPress={() => open(notification.serviceId)}
                  haptic="selection"
                  style={continuousCorners}
                  className="gap-xs rounded-md bg-neutral-50 p-md"
                >
                  <View className="flex-row flex-wrap items-center justify-between gap-sm">
                    <Text
                      className={`flex-1 text-start text-md font-semibold text-neutral-900 ${fontClass}`}
                    >
                      {notification.serviceTitle[language] ?? notification.serviceTitle.ca}
                    </Text>
                    <Text className={`text-sm tabular-nums text-neutral-600 ${fontClass}`}>
                      {dates.format(new Date(notification.createdAt))}
                    </Text>
                  </View>
                  <Text className={`text-start text-md text-neutral-800 ${fontClass}`}>
                    {notification.kind === 'approved'
                      ? t('decisionApproved')
                      : t('decisionRejected')}
                  </Text>
                  {notification.comment === null ? null : (
                    <Text className="text-start text-md text-neutral-900">
                      {notification.comment}
                    </Text>
                  )}
                </PressableScale>
              ))}
            </View>
          )}

          {services.data !== undefined && rows.length === 0 ? (
            <View className="gap-xs">
              <Text className={`text-start text-lg font-semibold text-neutral-900 ${fontClass}`}>
                {t('emptyTitle')}
              </Text>
              <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                {t('emptyBody')}
              </Text>
            </View>
          ) : (
            <View className="gap-sm">
              {rows.map((service) => {
                const category = categories.data?.find((item) => item.id === service.category_id);
                const actions = getEntityServiceActions(service.status);
                return (
                  <View
                    key={service.id}
                    testID={`entity-service-row-${service.id}`}
                    style={continuousCorners}
                    className="gap-sm rounded-md border border-neutral-200 bg-white p-md"
                  >
                    <Text className={`text-start text-md font-bold text-neutral-900 ${fontClass}`}>
                      {service.title.ca}
                    </Text>
                    <EntityServiceStatus service={service} />
                    {category === undefined ? null : (
                      <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                        {category.name[language] ?? category.name.ca}
                      </Text>
                    )}
                    {service.rejection_reason === null ? null : (
                      <Text className={`text-start text-md text-error ${fontClass}`}>
                        {`${t('rejectionLabel')}: ${service.rejection_reason}`}
                      </Text>
                    )}
                    <View className="flex-row flex-wrap gap-sm">
                      <CardButton
                        testID={`entity-service-open-${service.id}`}
                        label={actions.includes('edit') ? t('edit') : t('view')}
                        tone="quiet"
                        onPress={() => open(service.id)}
                      />
                      {actions.includes('resubmit') ? (
                        <CardButton
                          testID={`entity-service-resubmit-${service.id}`}
                          label={t('resubmit')}
                          tone="primary"
                          isBusy={resubmit.isPending && resubmit.variables === service.id}
                          onPress={() => {
                            setErrorCode(null);
                            resubmit.mutate(service.id, {
                              onSuccess: () => playHaptic('success'),
                              onError: onFailure,
                            });
                          }}
                        />
                      ) : null}
                      {actions.includes('delete') ? (
                        <CardButton
                          testID={`entity-service-delete-${service.id}`}
                          label={t('delete')}
                          tone="danger"
                          isBusy={remove.isPending && remove.variables === service.id}
                          onPress={() =>
                            confirmDelete(
                              t('deleteConfirm'),
                              () => {
                                setErrorCode(null);
                                remove.mutate(service.id, {
                                  onSuccess: () => playHaptic('success'),
                                  onError: onFailure,
                                });
                              },
                              [tProfile('cancelAction'), t('delete')],
                            )
                          }
                        />
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
