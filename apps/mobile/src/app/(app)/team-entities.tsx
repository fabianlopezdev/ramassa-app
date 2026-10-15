/**
 * Collaborating entities on the phone (RAPP-407), for `entities.manage`
 * holders, as the entities tab of the web admin's Settings: add an entity,
 * then each entity with its status, collaborators, referrals and pending
 * invitations. A tap opens the entity, where its collaborators are managed.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useEntityActions, useManagedEntities } from '@/lib/team-entities';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TeamEntitiesScreen() {
  const { t } = useTranslation('entity-management');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back, push } = useRouter();
  const entities = useManagedEntities();
  const { create } = useEntityActions();
  const [name, setName] = useState('');
  const [notice, setNotice] = useState<{ readonly ok: boolean; readonly text: string } | null>(
    null,
  );
  const canAdd = name.trim().length > 0 && !create.isPending;

  return (
    <SafeAreaView
      testID="team-entities"
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
            testID="team-entities-back"
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
              {t('managementTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('managementIntro')}
            </Text>
          </View>

          <View
            style={continuousCorners}
            className="gap-md rounded-md border border-neutral-200 bg-white p-md"
          >
            <AuthTextField
              testID="entity-name"
              label={t('entityName')}
              value={name}
              onChangeText={(next) => {
                setNotice(null);
                setName(next);
              }}
              maxLength={200}
            />
            <PressableScale
              testID="entity-add"
              accessibilityRole="button"
              accessibilityLabel={t('addEntity')}
              onPress={() =>
                create.mutate(name.trim(), {
                  onSuccess: (entityId) => {
                    playHaptic('success');
                    setName('');
                    setNotice({ ok: true, text: t('entityCreated') });
                    push(`/team-entity/${entityId}` as Href);
                  },
                  onError: () => {
                    playHaptic('error');
                    setNotice({ ok: false, text: t('actionError') });
                  },
                })
              }
              isBusy={create.isPending}
              isDisabled={!canAdd}
              haptic="tapLight"
              style={continuousCorners}
              className={`min-h-recommended items-center justify-center self-start rounded-md px-lg ${
                canAdd ? 'bg-primary' : 'bg-neutral-200'
              }`}
            >
              <Text
                className={`text-center text-md font-bold ${canAdd ? 'text-white' : 'text-neutral-500'} ${fontClass}`}
              >
                {create.isPending ? t('working') : t('addEntity')}
              </Text>
            </PressableScale>
          </View>

          {notice === null ? null : (
            <Text
              testID="entities-notice"
              accessibilityLiveRegion="polite"
              className={`text-start text-md ${notice.ok ? 'text-success' : 'text-error'} ${fontClass}`}
            >
              {notice.text}
            </Text>
          )}

          {entities.isError ? (
            <Text className={`text-start text-md text-error ${fontClass}`}>{t('actionError')}</Text>
          ) : (
            <View className="gap-sm">
              {(entities.data ?? []).map((entity) => (
                <PressableScale
                  key={entity.id}
                  testID={`entity-${entity.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={entity.name}
                  onPress={() => push(`/team-entity/${entity.id}` as Href)}
                  haptic="selection"
                  style={continuousCorners}
                  className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
                >
                  <View className="flex-row flex-wrap items-center justify-between gap-sm">
                    <Text
                      className={`flex-1 text-start text-md font-bold text-neutral-900 ${fontClass}`}
                    >
                      {entity.name}
                    </Text>
                    <Text className={`text-sm font-semibold text-neutral-700 ${fontClass}`}>
                      {entity.isActive ? t('status.active') : t('status.inactive')}
                    </Text>
                  </View>
                  <Text className={`text-start text-sm tabular-nums text-neutral-600 ${fontClass}`}>
                    {[
                      `${t('collaborators')}: ${entity.activeCollaboratorCount}`,
                      `${t('referrals')}: ${entity.referralCount}`,
                      `${t('pendingInvitations')}: ${entity.pendingInvitationCount}`,
                    ].join(' · ')}
                  </Text>
                </PressableScale>
              ))}
            </View>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
