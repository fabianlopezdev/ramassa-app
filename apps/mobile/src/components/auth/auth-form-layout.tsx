import type { ReactNode } from 'react';
import { View } from 'react-native';

/** Forms retain validation/submission ownership while screens place their action. */
export type AuthFormLayout = (fields: ReactNode, action: ReactNode) => ReactNode;

export const inlineAuthFormLayout: AuthFormLayout = (fields, action) => (
  <View className="gap-md">
    {fields}
    {action}
  </View>
);
