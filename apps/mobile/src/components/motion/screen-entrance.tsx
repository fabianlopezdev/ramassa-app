/**
 * The entrance of every screen (RAPP-875): the screen rises and fades in the
 * first time she reaches it after opening the app, the way an onboarding step
 * does. A screen she has already seen is simply there.
 *
 * Screens do not ask for it. The signed-in stack gives it to every screen it
 * opens through `screenEntranceLayout`, and a tab is wrapped once where it is
 * exported with `withScreenEntrance`, because a tab bar opens its screens
 * itself. A new screen therefore has the entrance from its first day.
 *
 * A screen whose blocks arrive one after another (the shared form layout)
 * takes the entrance over, and a group of tabs leaves it to its tabs, so only
 * the innermost owner moves.
 *
 * The screen fades in as a whole and its content column rises, as an
 * onboarding step does: the column is inside the scroll view, so nothing that
 * measures the safe area ever moves.
 *
 * A screen that grows out of a card's photo (RAPP-916, RAPP-920) has that
 * zoom as its entrance, so it does not fade or rise on top of it.
 *
 * The entrance waits until the screen is in front of her. A tab bar prepares
 * its tabs before she opens them, and a screen can load under another one; an
 * entrance that ran then would be over before she looked.
 */
import { PhotoZoomBoundary } from '@/components/media/photo-zoom';
import { useEntrance } from '@/components/motion/fade-slide-in';
import { NativeWindAnimatedView } from '@/components/motion/nativewind-animated-view';
import { arrivesByPhotoZoom } from '@/lib/photo-zoom-arrival';
import {
  RouteEntranceContext,
  useEntranceRise,
  useOwnEntrance,
  useScreenEntrance,
  type EntranceRise,
  type RouteEntrance,
} from '@/lib/screen-entrance';
import { useIsFocused } from 'expo-router';
import { useCallback, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { View } from 'react-native';
import { useAnimatedStyle } from 'react-native-reanimated';

interface ScreenEntranceProps {
  /** The route name: one identity for a screen, whichever record it shows. */
  readonly screenId: string;
  /** It grows out of a card's photo (RAPP-916, RAPP-920), which is its entrance. */
  readonly arrivesByZoom?: boolean;
  readonly children: ReactNode;
}

function ScreenEntrance({ screenId, arrivesByZoom = false, children }: ScreenEntranceProps) {
  // A screen inside a group: the group stands still and this screen moves.
  useOwnEntrance();
  const mode = useScreenEntrance(`route:${screenId}`, true);
  const isFocused = useIsFocused();
  const [hasBeenInFront, setHasBeenInFront] = useState(isFocused);
  if (isFocused && !hasBeenInFront) setHasBeenInFront(true);
  const [isTakenOver, setIsTakenOver] = useState(false);
  const takeOver = useCallback(() => setIsTakenOver(true), []);
  const { progress, travel, isMoving, onLayout } = useEntrance({
    ready: hasBeenInFront,
    skip: mode === 'none' || isTakenOver || arrivesByZoom,
    watchFinish: true,
  });
  const route = useMemo<RouteEntrance>(
    () => ({ mode, takeOver, rise: isMoving && travel > 0 ? { progress, travel } : null }),
    [mode, takeOver, isMoving, progress, travel],
  );
  // The screen only fades as a whole. Moving it would move its scroll views
  // too, and iOS then measures their safe area 24 points off and keeps it.
  const fade = useAnimatedStyle(() => ({ opacity: progress.get() }));
  return (
    <RouteEntranceContext value={route}>
      <NativeWindAnimatedView
        className="flex-1"
        style={fade}
        // While it fades, Android draws the screen as one picture, as iOS
        // always does; drawn layer by layer, a card's navy edge shows through
        // its half-faded white face and the cards flash blue (RAPP-976).
        needsOffscreenAlphaCompositing={isMoving}
        renderToHardwareTextureAndroid={isMoving}
        onLayout={onLayout}
      >
        {children}
      </NativeWindAnimatedView>
    </RouteEntranceContext>
  );
}

interface EntranceColumnProps {
  readonly className: string;
  readonly children: ReactNode;
}

/**
 * The content column of a screen (`PageWidth`, `FormWidth`). While its screen
 * is arriving it rises with it; mounted later, such as a row she scrolls to,
 * it is a plain view.
 */
export function EntranceColumn({ className, children }: EntranceColumnProps) {
  const rise = useEntranceRise();
  if (rise === null) return <View className={className}>{children}</View>;
  return (
    <RisingColumn rise={rise} className={className}>
      {children}
    </RisingColumn>
  );
}

function RisingColumn({
  rise,
  className,
  children,
}: EntranceColumnProps & { readonly rise: EntranceRise }) {
  const { progress, travel } = rise;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.get()) * travel }],
  }));
  return (
    <NativeWindAnimatedView className={className} style={style}>
      {children}
    </NativeWindAnimatedView>
  );
}

/** A group of tabs, such as `(tabs)`: a navigator whose tabs bring their own boundary. */
function isNavigatorGroup(routeName: string): boolean {
  return routeName.startsWith('(') && routeName.endsWith(')');
}

/**
 * A navigator's `screenLayout`: every screen it opens gets the entrance, and
 * the boundary a card's photo moves across on Android (RAPP-920). A group of
 * tabs gets no boundary of its own, so the boundaries of its tabs count.
 */
export function screenEntranceLayout({
  route,
  children,
}: {
  readonly route: { readonly name: string; readonly params?: object };
  readonly children: ReactNode;
}) {
  const screen = (
    <ScreenEntrance screenId={route.name} arrivesByZoom={arrivesByPhotoZoom(route.params)}>
      {children}
    </ScreenEntrance>
  );
  return isNavigatorGroup(route.name) ? screen : <PhotoZoomBoundary>{screen}</PhotoZoomBoundary>;
}

/** For a tab's default export, where no navigator layout reaches. */
export function withScreenEntrance(screenId: string, Screen: ComponentType) {
  function ScreenWithEntrance() {
    return (
      <PhotoZoomBoundary>
        <ScreenEntrance screenId={screenId}>
          <Screen />
        </ScreenEntrance>
      </PhotoZoomBoundary>
    );
  }
  ScreenWithEntrance.displayName = `ScreenEntrance(${screenId})`;
  return ScreenWithEntrance;
}
