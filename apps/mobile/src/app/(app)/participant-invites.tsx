/**
 * The organization's participant invites on the phone (RAPP-284), for
 * `participants.invite` holders: who was invited, by whom, and whether the
 * invite is open, used or expired. A new invite opens a sheet. An invite she
 * has not used can get 30 more days, which is how it is "resent" (an invite
 * sends no email), or be cancelled, which also stops the address signing in.
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { InviteSheet } from '@/components/participants/invite-sheet';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useParticipantInvites } from '@/lib/participant-invites';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { inviterName, inviteStatus, type InviteRow } from '@ramassa/shared/accounts';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';

const STATUS_LABEL_KEYS = {
  pending: 'inviteStatusPending',
  accepted: 'inviteStatusAccepted',
  expired: 'inviteStatusExpired',
} as const;

function TextAction({
  testID,
  label,
  onPress,
  isBusy,
}: {
  readonly testID: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly isBusy: boolean;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      isBusy={isBusy}
      haptic="tapLight"
      className="min-h-recommended self-start justify-center"
    >
      <Text className={`font-semibold text-primary-dark ${fontClass}`}>{label}</Text>
    </PressableScale>
  );
}

export default function ParticipantInvitesScreen() {
  const { t, i18n } = useTranslation('participants');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const { invites, create, renew, revoke } = useParticipantInvites();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const now = new Date();
  const formatDate = useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: MADRID_TIME_ZONE,
    });
    return (value: string) => format.format(new Date(value));
  }, [i18n.resolvedLanguage]);

  const cancel = (invite: InviteRow) => {
    const title = t('invites.cancelTitle', { email: invite.email });
    const done = () =>
      revoke.mutate(invite.id, {
        onSuccess: () => playHaptic('success'),
      });
    // The web build has no native alert, so it asks through the browser.
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${t('invites.cancelBody')}`)) done();
      return;
    }
    Alert.alert(title, t('invites.cancelBody'), [
      { text: t('invites.keep'), style: 'cancel' },
      { text: t('invites.cancel'), style: 'destructive', onPress: done },
    ]);
  };

  const rows = invites.data ?? [];
  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="invites-back"
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
              {t('invitesTitle')}
            </Text>
            {invites.isSuccess ? (
              <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                {t('invitesSummary', { count: rows.length })}
              </Text>
            ) : null}
          </View>
          <PressableScale
            testID="invites-new"
            accessibilityRole="button"
            accessibilityLabel={t('newTitle')}
            onPress={() => setIsSheetOpen(true)}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
          >
            <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
              {t('newTitle')}
            </Text>
          </PressableScale>

          {renew.isError || revoke.isError ? (
            <Text
              accessibilityLiveRegion="polite"
              className={`text-start text-sm text-error ${fontClass}`}
            >
              {t('invites.actionFailed')}
            </Text>
          ) : null}

          {invites.isPending ? (
            <AnnouncementFeedSkeleton accessibilityLabel={t('invitesTitle')} />
          ) : invites.isError ? (
            <Text className={`text-start text-md text-error ${fontClass}`}>
              {t('invites.loadFailed')}
            </Text>
          ) : rows.length === 0 ? (
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('invitesEmpty')}
            </Text>
          ) : (
            <View className="gap-sm">
              {rows.map((invite) => {
                const status = inviteStatus(invite, now);
                const name = inviterName(invite);
                const sent =
                  name === null
                    ? t('invites.rowNoName', { date: formatDate(invite.created_at) })
                    : t('invites.row', { name, date: formatDate(invite.created_at) });
                const state =
                  status === 'accepted' && invite.accepted_at !== null
                    ? t('invites.acceptedOn', { date: formatDate(invite.accepted_at) })
                    : status === 'expired'
                      ? t('invites.expiredOn', { date: formatDate(invite.expires_at) })
                      : t('invites.openUntil', { date: formatDate(invite.expires_at) });
                return (
                  <View
                    key={invite.id}
                    testID={`invite-row-${invite.id}`}
                    style={continuousCorners}
                    className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
                  >
                    <View className="flex-row flex-wrap items-baseline justify-between gap-sm">
                      <Text
                        selectable
                        className="text-start text-md font-semibold text-neutral-900"
                      >
                        {invite.email}
                      </Text>
                      <Text
                        testID={`invite-status-${invite.id}`}
                        className={`text-sm font-semibold ${
                          status === 'expired' ? 'text-error' : 'text-neutral-700'
                        } ${fontClass}`}
                      >
                        {t(STATUS_LABEL_KEYS[status])}
                      </Text>
                    </View>
                    {invite.reference_entity === null ? null : (
                      <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
                        {invite.reference_entity}
                      </Text>
                    )}
                    <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                      {sent}
                    </Text>
                    <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                      {state}
                    </Text>
                    {status === 'accepted' ? null : (
                      <View className="flex-row flex-wrap gap-md">
                        <TextAction
                          testID={`invite-renew-${invite.id}`}
                          label={t('invites.renew')}
                          onPress={() =>
                            renew.mutate(invite.id, { onSuccess: () => playHaptic('success') })
                          }
                          isBusy={renew.isPending && renew.variables === invite.id}
                        />
                        <TextAction
                          testID={`invite-cancel-${invite.id}`}
                          label={t('invites.cancel')}
                          onPress={() => cancel(invite)}
                          isBusy={revoke.isPending && revoke.variables === invite.id}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </PageWidth>
      </ScrollView>
      <InviteSheet visible={isSheetOpen} onClose={() => setIsSheetOpen(false)} create={create} />
    </SafeAreaView>
  );
}
