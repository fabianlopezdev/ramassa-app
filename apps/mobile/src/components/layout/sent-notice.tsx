/**
 * The notice a screen shows once she sent something from it: a mentoring
 * request, a suggestion, an incident report (RAPP-973). One piece, so the
 * three read the same: a white card with the success border, a title and one
 * line, popping in once.
 */
import { SuccessPop } from '@/components/motion/success-pop';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text, View } from 'react-native';

export function SentNotice({
  testID,
  title,
  body,
}: {
  readonly testID: string;
  readonly title: string;
  readonly body: string;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <SuccessPop>
      <View
        accessibilityRole="alert"
        testID={testID}
        className="gap-xs rounded-lg border border-success bg-white p-lg"
        style={continuousCorners}
      >
        <Text
          accessibilityRole="header"
          className={`text-start text-xl font-bold text-neutral-900 ${fontClass}`}
        >
          {title}
        </Text>
        <Text className={`text-start text-md text-neutral-700 ${fontClass}`}>{body}</Text>
      </View>
    </SuccessPop>
  );
}
