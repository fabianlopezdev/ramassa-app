/**
 * One service submission on the phone (RAPP-414), as the web portal's service
 * page. A draft, a rejected or a published submission opens in the form; one
 * under review or approved shows read only, with a note on what happens next.
 * Below, the comments between the entity and the team, oldest first, and a
 * new comment.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { EntityServiceForm } from '@/components/entity/entity-service-form';
import { EntityServiceStatus } from '@/components/entity/entity-service-status';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import {
  useEntityService,
  useEntityServiceActions,
  useEntityServiceCategories,
  useOwnServiceContacts,
} from '@/lib/entity-services';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getErrorMessageKey, toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { getEntityServiceActions, type EntityServiceRow } from '@ramassa/shared/services/entity';

function ReadonlyService({
  service,
  dates,
}: {
  readonly service: EntityServiceRow;
  readonly dates: Intl.DateTimeFormat;
}) {
  const { t } = useTranslation('entity-services');
  const fontClass = useLanguageFontClass();
  return (
    <View testID="entity-service-readonly" className="gap-md">
      <Text
        accessibilityRole="header"
        className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
      >
        {service.title.ca}
      </Text>
      <EntityServiceStatus service={service} />
      <Text
        style={continuousCorners}
        className={`rounded-md bg-neutral-100 p-md text-start text-md text-neutral-800 ${fontClass}`}
      >
        {t(service.status === 'approved' ? 'approvedNotice' : 'pendingNotice')}
      </Text>
      {service.description?.ca === undefined ? null : (
        <Text className="text-start text-md text-neutral-900">{service.description.ca}</Text>
      )}
      <View className="flex-row flex-wrap gap-lg">
        <View className="gap-xs">
          <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
            {t('createdAt')}
          </Text>
          <Text className="text-start text-md text-neutral-900">
            {dates.format(new Date(service.created_at))}
          </Text>
        </View>
        <View className="gap-xs">
          <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
            {t('updatedAt')}
          </Text>
          <Text className="text-start text-md text-neutral-900">
            {dates.format(new Date(service.updated_at))}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function EntityServiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation('entity-services');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const { service, comments } = useEntityService(id);
  const categories = useEntityServiceCategories();
  const contacts = useOwnServiceContacts();
  const { comment } = useEntityServiceActions();
  const [body, setBody] = useState('');
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const language = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const dates = useMemo(
    () => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: MADRID_TIME_ZONE }),
    [language],
  );
  const times = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: MADRID_TIME_ZONE,
      }),
    [language],
  );
  const data = service.data;
  const canEdit = data !== undefined && getEntityServiceActions(data.status).includes('edit');
  const canSend = body.trim().length > 0 && !comment.isPending;

  return (
    <SafeAreaView
      testID="entity-service"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-3xl"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="entity-service-back"
            accessibilityLabel={t('backToList')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {t('backToList')}
            </Text>
          </PressableScale>

          {data === undefined ? null : canEdit ? (
            categories.data === undefined || contacts.data === undefined ? null : (
              <>
                <View className="gap-sm">
                  <Text
                    accessibilityRole="header"
                    className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
                  >
                    {t('editTitle')}
                  </Text>
                  <EntityServiceStatus service={data} />
                  {data.rejection_reason === null ? null : (
                    <Text className={`text-start text-md text-error ${fontClass}`}>
                      {`${t('rejectionLabel')}: ${data.rejection_reason}`}
                    </Text>
                  )}
                </View>
                <EntityServiceForm
                  // A save reads the submission again, so the form starts from it.
                  key={data.updated_at}
                  categories={categories.data}
                  contacts={contacts.data}
                  service={data}
                  onSaved={() => setIsSaved(true)}
                />
                {isSaved ? (
                  <Text
                    testID="entity-service-saved"
                    accessibilityLiveRegion="polite"
                    className={`text-start text-md text-success ${fontClass}`}
                  >
                    {t('saved')}
                  </Text>
                ) : null}
              </>
            )
          ) : (
            <ReadonlyService service={data} dates={dates} />
          )}

          {data === undefined ? null : (
            <View
              testID="entity-service-comments"
              style={continuousCorners}
              className="gap-md rounded-md border border-neutral-200 bg-white p-md"
            >
              <Text
                accessibilityRole="header"
                className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}
              >
                {t('commentsTitle')}
              </Text>
              {(comments.data ?? []).length === 0 ? (
                <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                  {t('commentsEmpty')}
                </Text>
              ) : (
                (comments.data ?? []).map((entry) => (
                  <View
                    key={entry.id}
                    testID={`entity-service-comment-${entry.id}`}
                    style={continuousCorners}
                    className="gap-xs rounded-md bg-neutral-50 p-md"
                  >
                    <View className="flex-row flex-wrap items-center justify-between gap-sm">
                      <Text
                        className={`text-start text-sm font-semibold text-neutral-800 ${fontClass}`}
                      >
                        {entry.authorRole === 'entity' ? t('commentEntity') : t('commentStaff')}
                      </Text>
                      <Text className={`text-sm tabular-nums text-neutral-600 ${fontClass}`}>
                        {times.format(new Date(entry.createdAt))}
                      </Text>
                    </View>
                    <Text className="text-start text-md text-neutral-900">{entry.body}</Text>
                  </View>
                ))
              )}
              <AuthTextField
                testID="entity-service-comment-body"
                label={t('commentsPlaceholder')}
                value={body}
                onChangeText={(next) => {
                  setErrorCode(null);
                  setBody(next);
                }}
                multiline
                maxLength={4_000}
              />
              {errorCode === null ? null : (
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  className={`text-start text-md text-error ${fontClass}`}
                >
                  {tErrors(getErrorMessageKey(errorCode))}
                </Text>
              )}
              <PressableScale
                testID="entity-service-comment-send"
                accessibilityRole="button"
                accessibilityLabel={t('commentsSend')}
                onPress={() =>
                  comment.mutate(
                    { serviceId: data.id, body },
                    {
                      onSuccess: () => {
                        playHaptic('success');
                        setBody('');
                      },
                      onError: (error) => {
                        playHaptic('error');
                        setErrorCode(toAppError(error).code);
                      },
                    },
                  )
                }
                isBusy={comment.isPending}
                isDisabled={!canSend}
                haptic="tapLight"
                style={continuousCorners}
                className={`min-h-recommended items-center justify-center rounded-md px-lg ${
                  canSend ? 'bg-primary' : 'bg-neutral-200'
                }`}
              >
                <Text
                  className={`text-center text-md font-bold ${canSend ? 'text-white' : 'text-neutral-500'} ${fontClass}`}
                >
                  {comment.isPending ? t('commentsSending') : t('commentsSend')}
                </Text>
              </PressableScale>
            </View>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
