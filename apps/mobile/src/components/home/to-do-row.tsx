/**
 * One thing waiting for her in Per fer (RAPP-827): a raised row with an icon,
 * its mark (Nou, or the word for continue once she has started), its name and
 * an arrow. The whole row opens it. A pending form and a survey share it.
 */
import { AttentionChip } from '@/components/home/attention-chip';
import { RaisedCard } from '@/components/layout/raised-card';
import type { SymbolViewProps } from 'expo-symbols';
import { Text, View } from 'react-native';

const toDoSymbol: SymbolViewProps['name'] = {
  ios: 'list.clipboard',
  android: 'assignment',
  web: 'assignment',
};

interface ToDoRowProps {
  readonly testID?: string;
  readonly title: string;
  /** A line under the name, such as the date a form is due. */
  readonly detail?: string;
  readonly accessibilityLabel: string;
  readonly markLabel: string;
  readonly isStarted?: boolean;
  readonly languageFontClass: string;
  readonly onOpen: () => void;
}

export function ToDoRow({
  testID,
  title,
  detail,
  accessibilityLabel,
  markLabel,
  isStarted = false,
  languageFontClass,
  onOpen,
}: ToDoRowProps) {
  return (
    <RaisedCard
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      onOpen={onOpen}
      symbol={toDoSymbol}
    >
      <View className="flex-row">
        <AttentionChip
          label={markLabel}
          tone={isStarted ? 'started' : 'new'}
          languageFontClass={languageFontClass}
        />
      </View>
      <Text className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}>
        {title}
      </Text>
      {detail === undefined ? null : (
        <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>{detail}</Text>
      )}
    </RaisedCard>
  );
}
