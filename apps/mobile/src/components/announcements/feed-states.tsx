import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { ErrorCodeLine } from '@/components/error-code-line';
import { SkeletonPulse } from '@/components/motion/skeleton-pulse';
import { continuousCorners } from '@/lib/continuous-corners';
import { Text, View } from 'react-native';
import type { AppErrorCode } from '@ramassa/shared/errors';

export function OfflineBanner({
  label,
  languageFontClass,
}: {
  readonly label: string;
  readonly languageFontClass: string;
}) {
  return (
    <View
      accessibilityRole="alert"
      className="flex-row items-center gap-sm rounded-md border border-secondary-dark bg-secondary-light px-md py-sm"
      style={continuousCorners}
    >
      <View className="h-sm w-sm rounded-full bg-warning" />
      <Text
        className={`flex-1 text-start text-sm font-medium text-neutral-900 ${languageFontClass}`}
      >
        {label}
      </Text>
    </View>
  );
}

export function AnnouncementEmptyState({
  title,
  body,
  languageFontClass,
}: {
  readonly title: string;
  readonly body: string;
  readonly languageFontClass: string;
}) {
  return (
    <View className="items-center gap-md py-3xl">
      <View
        accessible={false}
        className="h-3xl w-3xl justify-center gap-sm rounded-lg border-2 border-primary bg-neutral-50 px-md"
        style={continuousCorners}
      >
        <View className="h-sm w-full rounded-full bg-primary-light" />
        <View className="h-sm w-3/4 rounded-full bg-secondary-dark" />
        <View className="h-sm w-1/2 rounded-full bg-neutral-300" />
      </View>
      <Text
        accessibilityRole="header"
        className={`text-center text-xl font-bold text-neutral-900 ${languageFontClass}`}
      >
        {title}
      </Text>
      <Text className={`max-w-form text-center text-md text-neutral-600 ${languageFontClass}`}>
        {body}
      </Text>
    </View>
  );
}

export function AnnouncementFeedSkeleton({
  accessibilityLabel,
}: {
  readonly accessibilityLabel: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
      className="flex-1 gap-lg bg-white p-lg"
    >
      <SkeletonPulse className="h-2xl w-1/2 rounded-md" />
      <SkeletonPulse className="h-lg w-full rounded-md" />
      <SkeletonPulse className="h-recommended w-full rounded-full" />
      <SkeletonPulse className="h-3xl w-full rounded-lg" />
      <SkeletonPulse className="h-3xl w-full rounded-lg" />
    </View>
  );
}

export function AnnouncementFeedError({
  message,
  retryLabel,
  code,
  languageFontClass,
  onRetry,
}: {
  readonly message: string;
  readonly retryLabel: string;
  readonly code: AppErrorCode;
  readonly languageFontClass: string;
  readonly onRetry: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-md bg-white p-lg">
      <Text
        accessibilityRole="alert"
        className={`text-center text-md text-neutral-800 ${languageFontClass}`}
      >
        {message}
      </Text>
      <ErrorCodeLine code={code} />
      <View className="w-full max-w-form">
        <AuthSubmitButton label={retryLabel} onPress={onRetry} />
      </View>
    </View>
  );
}
