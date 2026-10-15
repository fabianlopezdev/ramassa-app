/**
 * Notifications and targeted push on the phone (RAPP-385), for
 * `notifications.send` holders, as the web admin's workspace. A message starts
 * from a template or blank, in Catalan, with the four translations generated
 * and approved; the audience shows live how many participants and devices it
 * reaches before anything goes out. The message can be saved as a template,
 * and the history shows how each send went. Custom groups are managed apart.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { MultilingualField } from '@/components/content/multilingual-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { AudiencePicker } from '@/components/team/audience-picker';
import { reviewHandlers, reviewOptions } from '@/lib/content-translations';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import {
  useAudiencePreview,
  useNotificationActions,
  useNotificationWorkspace,
} from '@/lib/team-notifications';
import { generateDrafts } from '@/lib/translation-worker';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { localizedTextFromReview } from '@ramassa/shared/announcements';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import {
  NOTIFICATION_TEMPLATE_CATEGORIES,
  notificationContentSchema,
  type NotificationAudience,
  type NotificationSendHistory,
  type NotificationTemplateCategory,
} from '@ramassa/shared/notifications';
import { useTranslationReview } from '@ramassa/shared/translation/react';

const TITLE_MAX = 120;
const BODY_MAX = 1000;
const CATEGORY_KEYS: Readonly<Record<NotificationTemplateCategory, string>> = {
  transactional: 'categoryTransactional',
  engagement: 'categoryEngagement',
  marketing: 'categoryMarketing',
};
const STATE_KEYS: Readonly<Record<NotificationSendHistory['state'], string>> = {
  pending: 'statePending',
  processing: 'stateProcessing',
  awaiting_receipts: 'stateAwaitingReceipts',
  retrying: 'stateRetrying',
  complete: 'stateComplete',
};
const AUDIENCE_KEYS: Readonly<Record<NotificationAudience['kind'], string>> = {
  all: 'audienceAll',
  interest: 'audienceInterest',
  signup: 'audienceSignup',
  entity: 'audienceEntity',
  custom_group: 'audienceCustomGroup',
};
const BLANK_TEMPLATE = 'blank';

type Notice = 'sent' | 'template' | 'error' | 'translations' | null;

/** The Catalan text and its approved translations, all five, or nothing. */
function reviewedCopy(source: string, review: Parameters<typeof localizedTextFromReview>[1]) {
  const parsed = notificationContentSchema.safeParse(localizedTextFromReview(source, review));
  return parsed.success ? parsed.data : null;
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const fontClass = useLanguageFontClass();
  return (
    <View
      style={continuousCorners}
      className="gap-md rounded-md border border-neutral-200 bg-white p-md"
    >
      <Text
        accessibilityRole="header"
        className={`text-start text-xl font-bold text-neutral-900 ${fontClass}`}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function TeamNotificationsScreen() {
  const { t, i18n } = useTranslation('notifications');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const { templates, groups, options, history } = useNotificationWorkspace();
  const { send, saveTemplate } = useNotificationActions();
  const [templateId, setTemplateId] = useState(BLANK_TEMPLATE);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<NotificationAudience | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateCategory, setTemplateCategory] =
    useState<NotificationTemplateCategory>('engagement');
  const titleReview = useTranslationReview();
  const bodyReview = useTranslationReview();
  const preview = useAudiencePreview(audience);
  const members = audience === null ? [] : (preview.data ?? []);
  const devices = members.reduce((total, member) => total + member.deviceCount, 0);
  const isReviewed = titleReview.isPublishable && bodyReview.isPublishable;
  const touch = () => setNotice(null);
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );

  const applyTemplate = (nextId: string) => {
    setTemplateId(nextId);
    setNotice(null);
    const template = templates.data?.find((item) => item.id === nextId);
    if (template === undefined) {
      setTitle('');
      setBody('');
      titleReview.reset();
      bodyReview.reset();
      return;
    }
    setTitle(template.title.ca);
    setBody(template.body.ca);
    const titleStart = reviewOptions(template.title.ca, template.title);
    const bodyStart = reviewOptions(template.body.ca, template.body);
    if (titleStart !== undefined) titleReview.start(titleStart);
    if (bodyStart !== undefined) bodyReview.start(bodyStart);
  };

  const generate = async () => {
    setNotice(null);
    setIsGenerating(true);
    const failure = await generateDrafts([
      { source: title, start: titleReview.start },
      { source: body, start: bodyReview.start },
    ]);
    setIsGenerating(false);
    if (failure !== null) setNotice('error');
  };

  const done = (next: Notice) => ({
    onSuccess: () => {
      playHaptic('success');
      setNotice(next);
    },
    onError: () => {
      playHaptic('error');
      setNotice('error');
    },
  });

  const sendNow = () => {
    if (audience === null || members.length === 0) return;
    const titleCopy = reviewedCopy(title, titleReview.review);
    const bodyCopy = reviewedCopy(body, bodyReview.review);
    if (!isReviewed || titleCopy === null || bodyCopy === null) {
      setNotice('translations');
      return;
    }
    send.mutate(
      {
        templateId: templateId === BLANK_TEMPLATE ? null : templateId,
        title: titleCopy,
        body: bodyCopy,
        audience,
        expectedRecipientCount: members.length,
      },
      done('sent'),
    );
  };

  const saveAsTemplate = () => {
    const titleCopy = reviewedCopy(title, titleReview.review);
    const bodyCopy = reviewedCopy(body, bodyReview.review);
    if (!isReviewed || titleCopy === null || bodyCopy === null) {
      setNotice('translations');
      return;
    }
    saveTemplate.mutate(
      { name: templateName, category: templateCategory, title: titleCopy, body: bodyCopy },
      {
        onSuccess: () => {
          playHaptic('success');
          setNotice('template');
          setTemplateName('');
        },
        onError: () => {
          playHaptic('error');
          setNotice('error');
        },
      },
    );
  };

  const noticeText =
    notice === 'sent'
      ? t('sendSuccess')
      : notice === 'template'
        ? t('templateSaved')
        : notice === 'translations'
          ? t('translationRequired')
          : notice === 'error'
            ? t('error')
            : null;
  const canGenerate = title.trim().length > 0 && body.trim().length > 0 && !isGenerating;

  return (
    <SafeAreaView
      testID="team-notifications"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-3xl"
        keyboardShouldPersistTaps="handled"
      >
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="team-notifications-back"
            accessibilityLabel={tCommon('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {tCommon('back')}
            </Text>
          </PressableScale>
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('title')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>{t('intro')}</Text>
          </View>

          <Section title={t('composeTitle')}>
            <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
              {t('templateLabel')}
            </Text>
            <View className="flex-row flex-wrap gap-sm">
              {[{ id: BLANK_TEMPLATE, name: t('customMessage') }, ...(templates.data ?? [])].map(
                (template) => (
                  <ChoiceOption
                    key={template.id}
                    testID={`notification-template-${template.id}`}
                    value={template.id}
                    label={template.name}
                    selected={template.id === templateId}
                    onSelect={applyTemplate}
                    languageFontClass={fontClass}
                  />
                ),
              )}
            </View>
            <MultilingualField
              testIDPrefix="notification-title"
              label={t('fieldTitle')}
              value={title}
              onChangeText={(next) => {
                touch();
                setTitle(next);
              }}
              maxLength={TITLE_MAX}
              {...reviewHandlers(titleReview, touch)}
            />
            <MultilingualField
              testIDPrefix="notification-body"
              label={t('fieldBody')}
              value={body}
              onChangeText={(next) => {
                touch();
                setBody(next);
              }}
              maxLength={BODY_MAX}
              multiline
              {...reviewHandlers(bodyReview, touch)}
            />
            <PressableScale
              testID="notification-generate"
              accessibilityRole="button"
              accessibilityLabel={
                isGenerating ? t('generatingTranslations') : t('generateTranslations')
              }
              onPress={() => void generate()}
              isBusy={isGenerating}
              isDisabled={!canGenerate}
              haptic="tapLight"
              style={continuousCorners}
              className={`min-h-recommended items-center justify-center rounded-md border px-lg ${
                canGenerate ? 'border-primary bg-white' : 'border-neutral-200 bg-neutral-100'
              }`}
            >
              <Text
                className={`text-center text-md font-bold ${canGenerate ? 'text-primary-dark' : 'text-neutral-500'} ${fontClass}`}
              >
                {isGenerating ? t('generatingTranslations') : t('generateTranslations')}
              </Text>
            </PressableScale>
            <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
              {t('translationHelp')}
            </Text>

            {options.data === undefined ? null : (
              <AudiencePicker
                testIDPrefix="notification"
                audience={audience}
                groups={groups.data ?? []}
                options={options.data}
                onChange={(next) => {
                  touch();
                  setAudience(next);
                }}
              />
            )}
            <Text
              testID="notification-confirmation"
              accessibilityLiveRegion="polite"
              className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}
            >
              {audience === null
                ? t('emptyAudience')
                : preview.isFetching && preview.data === undefined
                  ? t('previewing')
                  : members.length === 0
                    ? t('emptyAudience')
                    : t('confirmation', { count: members.length, devices })}
            </Text>
            <PressableScale
              testID="notification-send"
              accessibilityRole="button"
              accessibilityLabel={t('sendAction')}
              onPress={sendNow}
              isBusy={send.isPending}
              isDisabled={audience === null || members.length === 0 || preview.isFetching}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
            >
              <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
                {send.isPending ? t('sending') : t('sendAction')}
              </Text>
            </PressableScale>
            {noticeText === null ? null : (
              <Text
                testID="notification-notice"
                accessibilityLiveRegion="polite"
                className={`text-start text-sm ${
                  notice === 'sent' || notice === 'template' ? 'text-success' : 'text-error'
                } ${fontClass}`}
              >
                {noticeText}
              </Text>
            )}
          </Section>

          <Section title={t('templatesTitle')}>
            <AuthTextField
              testID="notification-template-name"
              label={t('templateName')}
              value={templateName}
              onChangeText={setTemplateName}
              maxLength={80}
            />
            <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
              {t('templateCategory')}
            </Text>
            <View className="flex-row flex-wrap gap-sm">
              {NOTIFICATION_TEMPLATE_CATEGORIES.map((category) => (
                <ChoiceOption
                  key={category}
                  testID={`notification-template-category-${category}`}
                  value={category}
                  label={t(CATEGORY_KEYS[category])}
                  selected={category === templateCategory}
                  onSelect={setTemplateCategory}
                  languageFontClass={fontClass}
                />
              ))}
            </View>
            <PressableScale
              testID="notification-save-template"
              accessibilityRole="button"
              accessibilityLabel={t('saveTemplate')}
              onPress={saveAsTemplate}
              isBusy={saveTemplate.isPending}
              isDisabled={templateName.trim().length === 0}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 bg-white px-lg"
            >
              <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
                {t('saveTemplate')}
              </Text>
            </PressableScale>
          </Section>

          <Section title={t('historyTitle')}>
            {(history.data ?? []).length === 0 ? (
              <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                {t('historyEmpty')}
              </Text>
            ) : (
              <View className="gap-sm">
                {(history.data ?? []).map((item) => (
                  <View
                    key={item.id}
                    testID={`notification-history-${item.id}`}
                    style={continuousCorners}
                    className="gap-xs rounded-md bg-neutral-50 p-md"
                  >
                    <View className="flex-row flex-wrap items-center justify-between gap-sm">
                      <Text
                        className={`text-start text-sm tabular-nums text-neutral-600 ${fontClass}`}
                      >
                        {format.format(new Date(item.createdAt))}
                      </Text>
                      <Text className={`text-sm font-semibold text-neutral-800 ${fontClass}`}>
                        {t(STATE_KEYS[item.state])}
                      </Text>
                    </View>
                    <Text className={`text-start text-md text-neutral-900 ${fontClass}`}>
                      {t('historyAudience', { audience: t(AUDIENCE_KEYS[item.audienceKind]) })}
                    </Text>
                    <Text
                      className={`text-start text-sm tabular-nums text-neutral-700 ${fontClass}`}
                    >
                      {[
                        t('historyRecipients', { count: item.recipientCount }),
                        t('historyDevices', { count: item.deviceCount }),
                        t('historySent', { count: item.sentCount }),
                        t('historyDelivered', { count: item.deliveredCount }),
                        t('historyFailed', { count: item.failedCount }),
                      ].join(' · ')}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Section>
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
