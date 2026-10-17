/**
 * The app lock gate (RAPP-236). It covers the app with a lock screen at a cold
 * start and after the chosen time in the background, and opens again with
 * Face ID, a fingerprint or the device passcode. While the app is not in the
 * front it shows the same cover, so the app switcher's snapshot shows no data.
 *
 * The lock needs the phone's own lock: on a phone with no passcode, and on the
 * web, it never engages, and the settings screen says why.
 */
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import {
  effectiveAppLockSettings,
  readAppLockSettings,
  shouldLockOnReturn,
  writeAppLockSettings,
  type AppLockSettings,
} from '@/lib/app-lock';
import { takePreviewHandover } from '@/lib/preview-handover';
import { useGuardedLogout } from '@/lib/sign-out-guard';
import { privateStorage } from '@/lib/storage';
import { usePendingSigningCount } from '@/lib/tablet-signing';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform, StyleSheet, Text, View, type AppStateStatus } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';

interface AppLockContextValue {
  /** False on the web and on a phone without a passcode. */
  readonly isAvailable: boolean;
  /** Null when nobody is signed in. */
  readonly settings: AppLockSettings | null;
  readonly saveSettings: (settings: AppLockSettings) => void;
  /** Asks for Face ID, a fingerprint or the passcode; true when it matched. */
  readonly confirmOwner: () => Promise<boolean>;
  /**
   * True while the lock screen or the cover is up. A native Modal is drawn
   * above every view, the cover included, so each Modal hides while this is
   * true (a contract test checks every Modal in the app does).
   */
  readonly isCovered: boolean;
}

const AppLockContext = createContext<AppLockContextValue>({
  isAvailable: false,
  settings: null,
  saveSettings: () => undefined,
  confirmOwner: async () => false,
  isCovered: false,
});

export function useAppLock(): AppLockContextValue {
  return useContext(AppLockContext);
}

const IS_NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';

async function deviceHasLock(): Promise<boolean> {
  if (!IS_NATIVE) return false;
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  return level !== LocalAuthentication.SecurityLevel.NONE;
}

export function AppLockProvider({ children }: { readonly children: ReactNode }) {
  const { t } = useTranslation('auth');
  const { user, isLoading } = useAuth();
  const { area } = useAccountAccess();
  const userId = user?.id ?? null;

  // A choice made on this screen wins until the next read from storage.
  const [saved, setSaved] = useState<{
    readonly userId: string;
    readonly settings: AppLockSettings;
  } | null>(null);
  const settings = useMemo(() => {
    if (userId === null) return null;
    if (saved?.userId === userId) return saved.settings;
    return readAppLockSettings(privateStorage, userId, area);
  }, [userId, area, saved]);
  // Signings waiting on this tablet hold health data: the lock is on while
  // they wait, whatever she chose (RAPP-305). The screen still shows her choice.
  const pendingSignings = usePendingSigningCount();
  const lockSettings = useMemo(
    () => (settings === null ? null : effectiveAppLockSettings(settings, pendingSignings)),
    [settings, pendingSignings],
  );
  const isEnabled = lockSettings?.enabled === true;

  const [isAvailable, setIsAvailable] = useState(false);
  const [hasChecked, setHasChecked] = useState(!IS_NATIVE);
  const [isLocked, setIsLocked] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const backgroundedAt = useRef<number | null>(null);
  const authenticating = useRef(false);
  const previousUserId = useRef<string | null | undefined>(undefined);

  const saveSettings = useCallback(
    (next: AppLockSettings) => {
      if (userId === null) return;
      writeAppLockSettings(privateStorage, userId, next);
      setSaved({ userId, settings: next });
      // She is holding the phone and just changed the setting: no lock now.
      setIsLocked(false);
    },
    [userId],
  );

  const confirmOwner = useCallback(async () => {
    if (!IS_NATIVE) return false;
    authenticating.current = true;
    setIsAuthenticating(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('appLockPrompt'),
        cancelLabel: t('appLockCancel'),
        disableDeviceFallback: false,
      });
      return result.success;
    } finally {
      authenticating.current = false;
      setIsAuthenticating(false);
    }
  }, [t]);

  useEffect(() => {
    let isCurrent = true;
    void deviceHasLock().then((available) => {
      if (!isCurrent) return;
      setIsAvailable(available);
      setHasChecked(true);
    });
    return () => {
      isCurrent = false;
    };
  }, [appState]);

  // A cold start with a saved session starts locked. Signing in just now is
  // proof enough, so it starts open; signing out drops the lock. Starting or
  // leaving the player preview mounts this provider again while she holds the
  // phone, which is not a start (RAPP-371).
  useEffect(() => {
    if (isLoading) return;
    const isColdStart = previousUserId.current === undefined && !takePreviewHandover('app-lock');
    if (isColdStart || userId !== previousUserId.current) {
      setIsLocked(isColdStart && userId !== null);
      backgroundedAt.current = null;
    }
    previousUserId.current = userId;
  }, [isLoading, userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      setAppState(next);
      // The passcode screen on Android is another activity: going there and back
      // is not leaving the app.
      if (authenticating.current) return;
      if (next === 'background') {
        backgroundedAt.current ??= Date.now();
        return;
      }
      if (next !== 'active') return;
      if (
        lockSettings !== null &&
        shouldLockOnReturn({
          settings: lockSettings,
          backgroundedAtMs: backgroundedAt.current,
          nowMs: Date.now(),
        })
      ) {
        setIsLocked(true);
      }
      backgroundedAt.current = null;
    });
    return () => subscription.remove();
  }, [lockSettings]);

  const isActive = isEnabled && isAvailable;
  const showsLock = isEnabled && (!hasChecked || (isAvailable && isLocked));
  const showsCover = isActive && appState !== 'active' && !isAuthenticating;

  const unlock = useCallback(async () => {
    if (await confirmOwner()) setIsLocked(false);
  }, [confirmOwner]);

  // Ask once, at once, when the lock screen appears in the front, so a quick
  // glance with Face ID is all it takes. After a cancel, the button asks again.
  const hasPrompted = useRef(false);
  const shouldPrompt = showsLock && hasChecked && appState === 'active';
  useEffect(() => {
    if (!isLocked) hasPrompted.current = false;
  }, [isLocked]);
  useEffect(() => {
    if (!shouldPrompt || hasPrompted.current) return;
    hasPrompted.current = true;
    void unlock();
  }, [shouldPrompt, unlock]);

  const isCovered = showsLock || showsCover;
  const value = useMemo(
    () => ({ isAvailable, settings, saveSettings, confirmOwner, isCovered }),
    [isAvailable, settings, saveSettings, confirmOwner, isCovered],
  );

  return (
    <AppLockContext.Provider value={value}>
      <View
        style={styles.fill}
        accessibilityElementsHidden={isCovered}
        importantForAccessibility={isCovered ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {isCovered ? (
        <LockScreen canUnlock={showsLock && hasChecked} onUnlock={() => void unlock()} />
      ) : null}
    </AppLockContext.Provider>
  );
}

function LockScreen({
  canUnlock,
  onUnlock,
}: {
  readonly canUnlock: boolean;
  readonly onUnlock: () => void;
}) {
  const { t } = useTranslation('auth');
  const { t: tProfile } = useTranslation('profile');
  const languageFontClass = useLanguageFontClass();
  const signOut = useGuardedLogout();

  return (
    // The position is on a plain View: a className on the same element as a
    // style can replace that style, and the cover then stops covering.
    <View style={styles.cover} testID="app-lock-screen">
      <SafeAreaView className="flex-1 bg-neutral-50">
        <PageWidth className="flex-1">
          <View className="flex-1 justify-center gap-lg px-lg">
            <Text
              accessibilityRole="header"
              className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {t('appLockLockedTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>
              {t('appLockLockedBody')}
            </Text>
            {canUnlock ? (
              <>
                <PressableScale
                  testID="app-lock-unlock"
                  accessibilityRole="button"
                  accessibilityLabel={t('appLockUnlockAction')}
                  onPress={onUnlock}
                  haptic="tapLight"
                  className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
                >
                  <Text className={`text-lg font-bold text-white ${languageFontClass}`}>
                    {t('appLockUnlockAction')}
                  </Text>
                </PressableScale>
                {/* Somebody else's phone, or a forgotten passcode: signing out is
                  always possible, and the next person signs in with her own
                  account. */}
                <PressableScale
                  testID="app-lock-sign-out"
                  accessibilityRole="button"
                  accessibilityLabel={tProfile('signOutAction')}
                  onPress={signOut}
                  haptic="tapLight"
                  className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 px-lg"
                >
                  <Text className={`text-md font-semibold text-primary-dark ${languageFontClass}`}>
                    {tProfile('signOutAction')}
                  </Text>
                </PressableScale>
              </>
            ) : null}
          </View>
        </PageWidth>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cover: { ...StyleSheet.absoluteFill, zIndex: 1000 },
});
