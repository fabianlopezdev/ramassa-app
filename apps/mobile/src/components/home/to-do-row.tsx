/**
 * One thing waiting for her in Per fer (RAPP-827): the shared raised card
 * with an icon in the block at the start (RAPP-830, RAPP-842), its mark (Nou,
 * or the word for continue once she has started), its name and an arrow. The
 * whole row opens it. A pending form and a survey share it.
 */
import { RaisedIconCard } from '@/components/layout/raised-icon-card';

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
    <RaisedIconCard
      testID={testID}
      icon="clipboard"
      title={title}
      detail={detail}
      accessibilityLabel={accessibilityLabel}
      badge={
        markLabel === undefined ? null : { label: markLabel, tone: isStarted ? 'accent' : 'brand' }
      }
      languageFontClass={languageFontClass}
      onOpen={onOpen}
    />
  );
}
