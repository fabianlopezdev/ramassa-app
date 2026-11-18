/**
 * One thing waiting for her in Per fer (RAPP-827): a raised row with an icon
 * in the block at the start (RAPP-830), its mark (Nou, or the word for
 * continue once she has started), its name and an arrow. The whole row opens
 * it. A pending form and a survey share it.
 */
import { Badge } from '@/components/layout/badge';
import { RaisedCard, RaisedCardSymbol } from '@/components/layout/raised-card';
import { Text } from 'react-native';

interface ToDoRowProps {
  readonly testID?: string;
  readonly title: string;
  /** A line under the name, such as the date a form is due. */
  readonly detail?: string;
  readonly accessibilityLabel: string;
  /** Nou, or the word for continue. Left out in her later list. */
  readonly markLabel?: string;
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
      leading={<RaisedCardSymbol name="clipboard" />}
    >
      {markLabel === undefined ? null : (
        <Badge
          label={markLabel}
          tone={isStarted ? 'accentSoft' : 'brand'}
          languageFontClass={languageFontClass}
          className="self-start"
        />
      )}
      <Text className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}>
        {title}
      </Text>
      {detail === undefined ? null : (
        <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>{detail}</Text>
      )}
    </RaisedCard>
  );
}
