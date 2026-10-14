/**
 * "Preview as player" (RAPP-371, ADR-027), for every team member: from More, the
 * whole player app; from a published item, the player app open on that item.
 * An item that players cannot see yet says so instead, because the preview
 * shows only what players see.
 */
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { startPreview } from '@/lib/player-preview';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

export function useStartPreview() {
  const [isStarting, setIsStarting] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const start = useCallback(async (target: string | null) => {
    setIsStarting(true);
    setHasFailed(false);
    const result = await startPreview(target);
    // On success this screen unmounts with her session's tree.
    if (!result.ok) {
      setIsStarting(false);
      setHasFailed(true);
    }
  }, []);
  return { start, isStarting, hasFailed };
}

export function PreviewStartFailed({ isShown }: { readonly isShown: boolean }) {
  const { t } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  if (!isShown) return null;
  return (
    <Text
      testID="preview-as-player-failed"
      accessibilityLiveRegion="polite"
      className={`text-start text-sm text-error ${fontClass}`}
    >
      {t('previewStartFailed')}
    </Text>
  );
}

export function PreviewItemAsPlayer({
  target,
  isVisibleToPlayers,
}: {
  /** The item's player screen, such as `/announcement/<id>`. */
  readonly target: string;
  readonly isVisibleToPlayers: boolean;
}) {
  const { t } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { start, isStarting, hasFailed } = useStartPreview();
  if (!isVisibleToPlayers) {
    return (
      <Text
        testID="preview-as-player-unpublished"
        className={`text-start text-sm text-neutral-600 ${fontClass}`}
      >
        {t('previewNotPublished')}
      </Text>
    );
  }
  return (
    <View className="gap-xs">
      <PressableScale
        testID="preview-as-player"
        accessibilityRole="button"
        accessibilityLabel={t('previewAsPlayer')}
        onPress={() => void start(target)}
        isBusy={isStarting}
        haptic="tapLight"
        style={continuousCorners}
        className="min-h-recommended items-center justify-center self-start rounded-md border border-neutral-300 bg-white px-lg"
      >
        <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
          {t('previewAsPlayer')}
        </Text>
      </PressableScale>
      <PreviewStartFailed isShown={hasFailed} />
    </View>
  );
}
