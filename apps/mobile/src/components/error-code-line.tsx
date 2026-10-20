import { ShakeOnError } from '@/components/motion/shake-on-error';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text, View } from 'react-native';
import type { AppErrorCode } from '@ramassa/shared/errors';

/** Friendly, accessible feedback. The code stays internal for motion and diagnostics. */
export function FailureNotice({
  code,
  message,
}: {
  readonly code: AppErrorCode;
  readonly message: string;
}) {
  const languageFontClass = useLanguageFontClass();

  return (
    <ShakeOnError errorCode={code}>
      <View className="gap-xs">
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-form text-error ${languageFontClass}`}
        >
          {message}
        </Text>
      </View>
    </ShakeOnError>
  );
}
