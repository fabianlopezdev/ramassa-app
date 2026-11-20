import { usePlayerEvents } from '@/lib/player-events';
import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

/** How often an open activity asks for its places again. */
const EVENT_PLACES_REFRESH_MS = 15_000;

/**
 * The player's activities for a screen where the places left decide what she
 * can do (RAPP-883). The list is asked for again when the screen opens, when
 * she comes back to it, when the app returns to the front, and every few
 * seconds while she reads, so "Activitat plena" is on the screen before she
 * taps and not in the answer after.
 */
export function useFreshPlayerEvents() {
  const isFocused = useIsFocused();
  const query = usePlayerEvents({
    refetchInterval: isFocused ? EVENT_PLACES_REFRESH_MS : false,
  });
  const { refetch } = query;

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  useEffect(() => {
    if (!isFocused) return undefined;
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch();
    });
    return () => appState.remove();
  }, [isFocused, refetch]);

  return query;
}
