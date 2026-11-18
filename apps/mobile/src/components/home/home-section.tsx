/**
 * One section of Inici (RAPP-826): its title, its content, and a line that
 * separates it from the next section. The last section leaves the line out.
 */
import { HomeSectionHeader } from '@/components/home/home-section-header';
import type { ReactNode } from 'react';
import { View } from 'react-native';

interface HomeSectionProps {
  readonly testID?: string;
  readonly title: string;
  readonly languageFontClass: string;
  readonly isLast?: boolean;
  readonly children: ReactNode;
}

export function HomeSection({
  testID,
  title,
  languageFontClass,
  isLast = false,
  children,
}: HomeSectionProps) {
  return (
    <View testID={testID} className="gap-lg">
      <View className="gap-md">
        <HomeSectionHeader title={title} languageFontClass={languageFontClass} />
        {children}
      </View>
      {isLast ? null : <View accessible={false} className="border-b border-neutral-200" />}
    </View>
  );
}
