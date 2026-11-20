/**
 * One section of a screen, as Inici draws it (RAPP-826, shared by every screen
 * since RAPP-872): its title, its content, and a line that separates it from
 * the next section. The last section leaves the line out. The title size and
 * the gaps live here only, so every screen changes together.
 */
import { Divider } from '@/components/layout/divider';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

interface SectionTitleProps {
  readonly title: string;
  readonly className?: string;
}

/** The section title alone, for a heading that sits inside a list or a toggled view. */
export function SectionTitle({ title, className }: SectionTitleProps) {
  const fontClass = useLanguageFontClass();
  return (
    <Text
      accessibilityRole="header"
      className={`text-start text-2xl font-bold text-neutral-900 ${fontClass} ${className ?? ''}`}
    >
      {title}
    </Text>
  );
}

interface ScreenSectionProps {
  readonly testID?: string;
  readonly title: string;
  readonly isLast?: boolean;
  readonly children: ReactNode;
}

export function ScreenSection({ testID, title, isLast = false, children }: ScreenSectionProps) {
  return (
    <View testID={testID} className="gap-lg">
      <View className="gap-md">
        <SectionTitle title={title} />
        {children}
      </View>
      {isLast ? null : <Divider />}
    </View>
  );
}
