import { PressableScale } from '@/components/motion/pressable-scale';
import { composeContinuousViewStyle, continuousCorners } from '@/lib/continuous-corners';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import {
  createContext,
  use,
  useCallback,
  useMemo,
  type ComponentType,
  type ReactNode,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppError } from '@ramassa/shared/errors';
import {
  StructuredContentRenderer,
  type StructuredContentComponents,
  type StructuredContentVideoProps,
} from '@ramassa/shared/structured-content';
import { tokens } from '@ramassa/shared/tokens';

interface PlayerStructuredContentState {
  readonly blocks: readonly unknown[];
  readonly videoUrl: string | null;
  readonly title: string;
}

interface PlayerStructuredContentActions {
  readonly resolveImageSource: (
    imageUrl: string | null,
  ) => ReturnType<typeof resolveMediaImageSource>;
}

interface PlayerStructuredContentMeta {
  readonly unavailableLabel: string;
}

interface PlayerStructuredContentContextValue {
  readonly state: PlayerStructuredContentState;
  readonly actions: PlayerStructuredContentActions;
  readonly meta: PlayerStructuredContentMeta;
}

const PlayerStructuredContentContext = createContext<PlayerStructuredContentContextValue | null>(
  null,
);

const styles = StyleSheet.create({
  stepImageFrame: { width: '100%', height: tokens.contentWidth.form / 2 },
  stepImage: { width: '100%', height: '100%' },
});
const stepImageFrameStyle = composeContinuousViewStyle(styles.stepImageFrame);

function usePlayerStructuredContentContext() {
  const value = use(PlayerStructuredContentContext);
  if (value === null) {
    throw new AppError('VALIDATION-1', {
      message: 'Player structured content is missing its provider',
    });
  }
  return value;
}

function Container({ children }: { readonly children: React.ReactNode }) {
  return <View className="gap-lg">{children}</View>;
}

function Paragraph({ text }: { readonly text: string }) {
  const languageFontClass = useLanguageFontClass();
  return (
    <Text className={`text-start text-lg leading-7 text-neutral-800 ${languageFontClass}`}>
      {text}
    </Text>
  );
}

function Step({
  number,
  title,
  text,
  imageUrl,
  imageAlt,
}: {
  readonly number: number;
  readonly title: string;
  readonly text: string;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
}) {
  const languageFontClass = useLanguageFontClass();
  const {
    actions: { resolveImageSource },
  } = usePlayerStructuredContentContext();
  const imageSource = useMemo(() => resolveImageSource(imageUrl), [imageUrl, resolveImageSource]);

  return (
    <View
      className="gap-sm rounded-lg border border-neutral-200 bg-neutral-50 p-md"
      style={continuousCorners}
    >
      <Text
        accessibilityRole="header"
        className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}
      >
        {`${number}. ${title}`}
      </Text>
      <Text className={`text-start text-md leading-6 text-neutral-700 ${languageFontClass}`}>
        {text}
      </Text>
      {imageSource === null ? null : (
        <View className="overflow-hidden rounded-md" style={stepImageFrameStyle}>
          <Image
            source={imageSource}
            accessible={imageAlt !== null}
            accessibilityLabel={imageAlt ?? undefined}
            cachePolicy="memory-disk"
            contentFit="cover"
            style={styles.stepImage}
          />
        </View>
      )}
    </View>
  );
}

function Unsupported() {
  const languageFontClass = useLanguageFontClass();
  const { meta } = usePlayerStructuredContentContext();
  return (
    <View
      accessibilityRole="alert"
      className="rounded-md bg-neutral-100 p-md"
      style={continuousCorners}
    >
      <Text selectable className={`text-start text-sm text-neutral-700 ${languageFontClass}`}>
        {meta.unavailableLabel}
      </Text>
    </View>
  );
}

export interface PlayerStructuredContentProps {
  readonly blocks: readonly unknown[];
  readonly videoUrl: string | null;
  readonly title: string;
  readonly accessToken: string | undefined;
  readonly unavailableLabel: string;
}

export function createPlayerStructuredContentComponents(
  Video: ComponentType<StructuredContentVideoProps>,
): StructuredContentComponents {
  return { Container, Paragraph, Step, Video, Unsupported };
}

function PlayerStructuredContentProvider({
  blocks,
  videoUrl,
  title,
  accessToken,
  unavailableLabel,
  children,
}: PlayerStructuredContentProps & { readonly children: ReactNode }) {
  const resolveImageSource = useCallback(
    (imageUrl: string | null) =>
      resolveMediaImageSource({
        objectKeyOrUrl: imageUrl,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken,
      }),
    [accessToken],
  );
  const contextValue = useMemo(
    () => ({
      state: { blocks, videoUrl, title },
      actions: { resolveImageSource },
      meta: { unavailableLabel },
    }),
    [blocks, resolveImageSource, title, unavailableLabel, videoUrl],
  );
  return (
    <PlayerStructuredContentContext value={contextValue}>{children}</PlayerStructuredContentContext>
  );
}

function PlayerStructuredContentRenderer({
  components,
}: {
  readonly components: StructuredContentComponents;
}) {
  const { state } = usePlayerStructuredContentContext();
  return (
    <StructuredContentRenderer
      blocks={state.blocks}
      videoUrl={state.videoUrl}
      videoTitle={state.title}
      components={components}
    />
  );
}

export function PlayerStructuredContentFrame({
  components,
  ...providerProps
}: PlayerStructuredContentProps & { readonly components: StructuredContentComponents }) {
  return (
    <PlayerStructuredContentProvider {...providerProps}>
      <PlayerStructuredContentRenderer components={components} />
    </PlayerStructuredContentProvider>
  );
}

export function VideoLinkButton({
  title,
  label,
  onPress,
}: {
  readonly title: string;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const languageFontClass = useLanguageFontClass();
  return (
    <PressableScale
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      haptic="tapLight"
      style={continuousCorners}
      className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
    >
      <Text className={`text-md font-bold text-white ${languageFontClass}`}>{title}</Text>
    </PressableScale>
  );
}
