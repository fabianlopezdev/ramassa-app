/**
 * Collecting the participation authorization on a staff tablet (RAPP-305), for
 * `consents.collect` holders. The coach picks a player already in Ramassà, or
 * writes the first and last name of a woman who is not yet (a walk-in), then
 * taps Hand over: the tablet goes into signing mode for that one player.
 *
 * Signings made with no connection wait here, encrypted, until the tablet is
 * online. The roster needs a connection to load; a walk-in does not.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { OptionChip } from '@/components/onboarding/option-chip';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useParticipantList } from '@/lib/participant-lookup';
import {
  useAuthorizationForSigning,
  useSigningOutbox,
  useSigningSession,
} from '@/lib/tablet-signing';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signerName, walkInNameSchema, type TabletSigner } from '@ramassa/shared/authorization';
import { tokens } from '@ramassa/shared/tokens';

type Who = 'player' | 'walk_in';

const ROSTER_SEARCH = {
  q: '',
  entity: null,
  nationality: null,
  status: 'active',
  dependents: 'all',
  sort: 'last_name',
  dir: 'asc',
} as const;

export default function CollectSignaturesScreen() {
  const { t } = useTranslation('participants');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const router = useRouter();
  const { isAvailable } = useAppLock();
  const authorization = useAuthorizationForSigning(true);
  const { entries, retry } = useSigningOutbox();
  const { start } = useSigningSession();

  const [who, setWho] = useState<Who>('player');
  const [query, setQuery] = useState('');
  const [player, setPlayer] = useState<TabletSigner | null>(null);
  const [walkIn, setWalkIn] = useState({ firstName: '', lastName: '' });
  const roster = useParticipantList({ ...ROSTER_SEARCH, q: query });
  const players = roster.data?.pages.flatMap((page) => page.rows) ?? [];

  const parsedWalkIn = walkInNameSchema.safeParse(walkIn);
  const signer: TabletSigner | null =
    who === 'player'
      ? player
      : parsedWalkIn.success
        ? { kind: 'walk_in', ...parsedWalkIn.data }
        : null;
  const rejected = entries.filter((entry) => entry.rejection != null);
  const canHandOver = signer !== null && isAvailable && authorization.data != null;

  const handOver = () => {
    if (!canHandOver) return;
    playHaptic('success');
    start(signer);
    router.replace('/signing-mode' as Href);
  };

  return (
    <SafeAreaView
      testID="collect-signatures"
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
            testID="collect-back"
            accessibilityLabel={tCommon('back')}
            // After signing mode the screen may have nothing under it (RAPP-530).
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/more' as Href))}
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
              {t('signing.title')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('signing.intro')}
            </Text>
          </View>

          {entries.length === 0 ? null : (
            <View
              testID="collect-pending"
              style={continuousCorners}
              className="gap-sm rounded-md border border-neutral-200 bg-white p-md"
            >
              <Text
                accessibilityLiveRegion="polite"
                className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}
              >
                {t('signing.pending', { count: entries.length })}
              </Text>
              <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                {t('signing.pendingHint')}
              </Text>
              {rejected.map((entry) => (
                <View key={entry.id} className="gap-xs">
                  <Text className={`text-start text-sm text-error ${fontClass}`}>
                    {t('signing.refused', { name: signerName(entry.signer) })}
                  </Text>
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel={t('signing.retry')}
                    onPress={() => retry(entry.id)}
                    haptic="tapLight"
                    className="min-h-recommended self-start justify-center"
                  >
                    <Text className={`font-semibold text-primary-dark ${fontClass}`}>
                      {t('signing.retry')}
                    </Text>
                  </PressableScale>
                </View>
              ))}
            </View>
          )}

          {authorization.isPending ? (
            <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
          ) : authorization.data == null ? (
            <Text className={`text-start text-md text-error ${fontClass}`}>
              {authorization.isError ? t('signing.loadFailed') : t('signing.nothingPublished')}
            </Text>
          ) : null}

          {isAvailable ? null : (
            <Text className={`text-start text-md text-error ${fontClass}`}>
              {t('signing.needsDeviceLock')}
            </Text>
          )}

          <View className="flex-row flex-wrap gap-sm">
            <OptionChip
              testID="collect-who-player"
              label={t('signing.existingPlayer')}
              isSelected={who === 'player'}
              onPress={() => setWho('player')}
            />
            <OptionChip
              testID="collect-who-walk-in"
              label={t('signing.walkIn')}
              isSelected={who === 'walk_in'}
              onPress={() => setWho('walk_in')}
            />
          </View>

          {who === 'player' ? (
            <View className="gap-sm">
              <AuthTextField
                testID="collect-search"
                label={t('signing.search')}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
              {roster.isError ? (
                <Text className={`text-start text-sm text-error ${fontClass}`}>
                  {t('signing.rosterOffline')}
                </Text>
              ) : null}
              {players.map((row) => {
                const name = `${row.first_name} ${row.last_name}`;
                const isSelected = player?.kind === 'player' && player.profileId === row.id;
                return (
                  <PressableScale
                    key={row.id}
                    testID={`collect-player-${row.id}`}
                    accessibilityRole="radio"
                    isSelected={isSelected}
                    accessibilityLabel={name}
                    onPress={() => setPlayer({ kind: 'player', profileId: row.id, name })}
                    haptic="selection"
                    style={continuousCorners}
                    className={`min-h-recommended justify-center rounded-md border px-md ${
                      isSelected ? 'border-primary bg-primary/10' : 'border-neutral-200 bg-white'
                    }`}
                  >
                    <Text className={`text-start text-md text-neutral-900 ${fontClass}`}>
                      {name}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          ) : (
            <View className="gap-sm">
              <AuthTextField
                testID="collect-walk-in-first-name"
                label={t('signing.firstName')}
                value={walkIn.firstName}
                onChangeText={(firstName) => setWalkIn((value) => ({ ...value, firstName }))}
                maxLength={100}
              />
              <AuthTextField
                testID="collect-walk-in-last-name"
                label={t('signing.lastName')}
                value={walkIn.lastName}
                onChangeText={(lastName) => setWalkIn((value) => ({ ...value, lastName }))}
                maxLength={100}
              />
              <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                {t('signing.walkInHint')}
              </Text>
            </View>
          )}

          <PressableScale
            testID="collect-hand-over"
            accessibilityRole="button"
            accessibilityLabel={t('signing.handOver')}
            onPress={handOver}
            isDisabled={!canHandOver}
            haptic="tapLight"
            style={continuousCorners}
            className={`min-h-recommended items-center justify-center rounded-md px-lg ${
              canHandOver ? 'bg-primary' : 'bg-neutral-300'
            }`}
          >
            <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
              {t('signing.handOver')}
            </Text>
          </PressableScale>
          <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
            {t('signing.guidedAccessHint')}
          </Text>
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
